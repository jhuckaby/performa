// Performa Server Component
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var assert = require("assert");
var fs = require("fs");
var os = require("os");
var Path = require("path");
var cp = require("child_process");
var zlib = require('zlib');
var async = require('async');

var Class = require("pixl-class");
var Component = require("pixl-server/component");
var Tools = require("pixl-tools");
var Request = require("pixl-request");

var glob = Tools.glob;

module.exports = Class.create({
	
	__name: 'Performa',
	__parent: Component,
	__mixins: [ 
		require('./api.js')   // API Layer Mixin
	],
	
	systems: [
		{
			id: "hourly",
			date_format: "[yyyy]/[mm]/[dd]/[hh]",
			epoch_div: 60, // 1 sample per minute
			single_only: true
		},
		{
			id: "daily",
			date_format: "[yyyy]/[mm]/[dd]",
			epoch_div: 120, // 2 min =~ 720 samples per day
		},
		{
			id: "monthly",
			date_format: "[yyyy]/[mm]",
			epoch_div: 3600 // hour =~ 720 samples per month
		},
		{
			id: "yearly",
			date_format: "[yyyy]",
			epoch_div: 43200 // twelve hours =~ 730 pixels per year
		}
	],
	
	startup: function(callback) {
		// start app service
		var self = this;
		this.logDebug(3, "Performa engine starting up", process.argv );
		
		// we'll need these components frequently
		this.storage = this.server.Storage;
		this.web = this.server.WebServer;
		this.api = this.server.API;
		this.usermgr = this.server.User;
		
		// temp caches (flushed every minute)
		this.hostnameCache = {};
		this.groupCache = {};
		this.alertCache = {};
		
		// register our class as an API namespace
		this.api.addNamespace( "app", "api_", this );
		
		// shortcut for /api/app/file
		this.web.addURIHandler( /^\/files/, "File", this.api_file.bind(this) );
		
		// register a handler for HTTP OPTIONS (for CORS AJAX preflight)
		this.web.addMethodHandler( "OPTIONS", "CORS Preflight", this.corsPreflight.bind(this) );
		
		// listen for ticks so we can broadcast status
		this.server.on('tick', this.tick.bind(this));
		
		// register hooks for when users are created / updated / deleted
		this.usermgr.registerHook( 'after_create', this.afterUserChange.bind(this, 'user_create') );
		this.usermgr.registerHook( 'after_update', this.afterUserChange.bind(this, 'user_update') );
		this.usermgr.registerHook( 'after_delete', this.afterUserChange.bind(this, 'user_delete') );
		this.usermgr.registerHook( 'after_login', this.afterUserLogin.bind(this) );
		
		this.usermgr.registerHook( 'before_create', this.beforeUserChange.bind(this) );
		this.usermgr.registerHook( 'before_update', this.beforeUserChange.bind(this) );
		
		// intercept user login and session resume, to merge in extra data
		this.usermgr.registerHook( 'before_login', this.beforeUserLogin.bind(this) );
		this.usermgr.registerHook( 'before_resume_session', this.beforeUserLogin.bind(this) );
		
		// archive logs daily at midnight
		this.server.on('day', function() {
			self.archiveLogs();
		} );
		
		// enable storage maintenance
		this.server.on(this.server.config.get('maintenance'), function() {
			self.storage.runMaintenance( new Date(), self.runMaintenance.bind(self) );
		});
		
		// update more records on the minute
		this.server.on('minute', function(dargs) {
			self.summarizeMinuteData(dargs);
			self.monitorSelf();
		} );
		
		// create a http request instance for web hooks
		this.request = new Request( "Performa v" + this.server.__version );
		this.request.setTimeout( 30 * 1000 );
		this.request.setFollow( 5 );
		this.request.setAutoError( true );
		this.request.setKeepAlive( true );
		
		async.series(
			[
				function(callback) {
					self.storage.listGet( 'global/alerts', 0, 0, function(err, items) {
						if (err) return callback(err);
						self.alerts = items;
						callback();
					});
				},
				function(callback) {
					self.storage.listGet( 'global/commands', 0, 0, function(err, items) {
						if (err) return callback(err);
						self.commands = items;
						callback();
					});
				},
				function(callback) {
					self.storage.listGet( 'global/groups', 0, 0, function(err, items) {
						if (err) return callback(err);
						self.groups = items;
						callback();
					});
				},
				function(callback) {
					self.storage.listGet( 'global/monitors', 0, 0, function(err, items) {
						if (err) return callback(err);
						self.monitors = items;
						callback();
					});
				},
				function(callback) {
					self.storage.get( 'global/state', function(err, data) {
						if (err) return callback(err);
						self.state = data;
						callback();
					});
				}
			],
			function(err) {
				if (err) return callback(err);
				
				// if we suffered a crash and pixl-server-storage had to run recovery, log a loud warning here
				if (self.storage.recovery_log) {
					self.logTransaction('warning', "Unclean Shutdown: Database performed recovery operations (" + self.storage.recovery_count + " transactions rolled back). See " + Path.resolve(self.storage.recovery_log) + " for full details." );
				}
				
				// startup complete
				callback();
			}
		); // async.series
	},
	
	summarizeMinuteData: function(dargs) {
		// summarize all data submitted in the last minute
		var self = this;
		var epoch = dargs.epoch - 30; // make absolutely sure this is the *previous* minute
		
		// no submissions?  we're done then
		if (!Tools.numKeys(this.hostnameCache)) return;
		
		// make copy of hostname cache and clear it, for concurrency
		// (servers will keep submitting while we are summarizing)
		var hostname_cache = Tools.copyHash( this.hostnameCache, true );
		this.hostnameCache = {};
		
		// parallelize these up to storage concurrency limit
		async.eachLimit( this.systems, this.storage.concurrency,
			function(sys, callback) {
				self.summarizeMinuteSystem({
					sys: sys,
					epoch: epoch,
					hostnames: hostname_cache[ sys.id ],
				}, callback);
			},
			function(err) {
				if (err) {
					self.logError('summary', "Failed to summarize data: " + (err.message || err));
				}
				
				// finally, write out group data to a list
				self.writeGroupAlertData( epoch, function(err) {
					if (err) {
						self.logError('summary', "Failed to write group data: " + (err.message || err));
					}
					self.logDebug(9, "Minute summary complete");
				});
			}
		); // async.eachLimit
	},
	
	writeGroupAlertData: function(epoch, callback) {
		// write out group and alert data (totals and count) to list
		var self = this;
		var epoch_div = Math.floor( epoch / 60 );
		var group_data = {
			groups: Tools.copyHash( this.groupCache, true ),
			date: epoch_div * 60, // floored to minute
			epoch_div: epoch_div
		};
		this.groupCache = {};
		this.storage.listPush( 'timeline/overview', group_data, function(err) {
			if (err) return callback(err);
			
			var alert_data = {
				hostnames: Tools.copyHash( self.alertCache, true ),
				date: epoch_div * 60, // floored to minute
			};
			self.alertCache = {};
			
			self.storage.put( 'current/alerts', alert_data, callback );
		} );
	},
	
	summarizeMinuteSystem: function(args, callback) {
		// summarize data for a specific system
		var self = this;
		var sys = args.sys;
		var epoch = args.epoch;
		var epoch_div = Math.floor( epoch / sys.epoch_div );
		var dargs = Tools.getDateArgs( epoch );
		var hostnames = args.hostnames;
		this.logDebug(9, "Summarizing " + sys.id + " system for minute: " + dargs.yyyy_mm_dd + " " + dargs.hh_mi_ss);
		
		if (!hostnames || !Tools.numKeys(hostnames)) {
			// rare race condition can occur if a server submits metrics at the moment the summarize job starts
			this.logDebug(2, "No hostnames found in cache!  Race condition?  Skipping system: " + sys.id);
			return process.nextTick( callback );
		}
		
		var contrib_key = 'contrib/' + sys.id + '/' + Tools.sub( sys.date_format, dargs );
		var update_data = null;
		var new_record = false;
		
		async.series(
			[
				function(callback) {
					// first, load last list item to see if epoch_div matches
					self.storage.get( contrib_key, function(err, data) {
						if (err || !data) new_record = true;
						update_data = data || { hostnames: {} };
						callback();
					});
				},
				function(callback) {
					// merge in new hostnames and save
					var num_additions = 0;
					for (var hostname in hostnames) {
						if (!(hostname in update_data.hostnames)) num_additions++;
					}
					if (num_additions || new_record) {
						Tools.mergeHashInto( update_data.hostnames, hostnames );
						self.storage.put( contrib_key, update_data, callback );
					}
					else process.nextTick( callback );
				},
				function(callback) {
					// possibly set expiration if new record
					if (new_record && self.server.config.get('expiration')) {
						// we just created the record, so set its expiration date
						var exp_date = Tools.timeNow() + Tools.getSecondsFromText( self.server.config.get('expiration') );
						self.storage.expire( contrib_key, exp_date );
					}
					process.nextTick( callback );
				}
			],
			callback
		); // async.series
	},
	
	monitorSelf: function() {
		// spawn external performa-satellite to monitor ourselves
		// called every minute, runs in parallel with summarizeMinuteData
		if (!this.server.config.get('monitor_self')) return;
		
		var cli_args = [
			Path.resolve( 'node_modules/performa-satellite/index.js' ),
			'--config', Path.resolve( 'conf/config.json' ),
			'--host', 'localhost:' + this.web.config.get('http_port'),
			'--enabled'
		];
		var node_bin = process.argv[0];
		
		this.logDebug(9, "Spawning satellite as detached process to collect local metrics", {
			node_bin: node_bin,
			cli_args: cli_args
		});
		
		// spawn child
		var child_opts = {
			cwd: process.cwd(),
			detached: true,
			env: Tools.mergeHashes( process.env, {
				'PATH': process.env['PATH'] + ':/usr/bin:/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/local/sbin'
			} ),
			stdio: ['ignore', 'ignore', 'ignore']
		};
		
		try {
			child = cp.spawn( node_bin, cli_args, child_opts );
		}
		catch (err) {
			this.logError("satellite", "Child process error: " + Tools.getErrorDescription(err));
			return;
		}
		
		this.logDebug(9, "Spawned detached satellite process: " + child.pid);
		child.unref();
	},
	
	tick: function() {
		// called every second
		var self = this;
		var now = Tools.timeNow(true);
		
		if (this.numSocketClients) {
			var status = {
				epoch: Tools.timeNow()
			};
			
			this.authSocketEmit( 'status', status );
		}
	},
	
	beforeUserLogin: function(args, callback) {
		// infuse data into user login client response
		var self = this;
		
		args.resp = {
			epoch: Tools.timeNow()
		};
		
		callback();
	},
	
	afterUserLogin: function(args) {
		// user has logged in
		this.logActivity('user_login', this.getClientInfo(args, { 
			user: Tools.copyHashRemoveKeys( args.user, { password: 1, salt: 1 } )
		}));
	},
	
	beforeUserChange: function(args, callback) {
		// clean up user full name and nickname
		var self = this;
		callback();
	},
	
	afterUserChange: function(action, args) {
		// user data has changed
		var username = args.user.username; // username cannot change
		
		// add to activity log in the background
		this.logActivity(action, this.getClientInfo(args, { 
			user: Tools.copyHashRemoveKeys( args.user, { password: 1, salt: 1 } )
		}));
	},
	
	runMaintenance: function() {
		// run routine daily tasks, called after storage maint completes.
		var self = this;
		var timeline_key = 'timeline/overview';
		
		// don't run this if shutting down
		if (this.server.shut) return;
		
		this.logDebug(4, "Beginning Performa maintenance run");
		
		// delete old timeline data (for overview timeline)
		var max_len = Math.floor( Tools.getSecondsFromText( self.server.config.get('expiration') ) / 60 );
		
		this.storage.listGetInfo( timeline_key, function(err, list) {
			if (err) {
				self.logError('maint', "Failed to load list: " + timeline_key + ": " + err + ", skipping maintenance");
			}
			if (list && list.length && (list.length > max_len)) {
				var num_to_remove = list.length - max_len;
				self.logDebug(4, "Performing maintenance on list: " + timeline_key, { list: list, num_to_remove: num_to_remove });
				
				self.storage.listSplice( timeline_key, 0, num_to_remove, [], function(err) {
					if (err) {
						return self.logError('maint', "Failed to splice list: " + timeline_key + ": " + err);
					}
					self.chopLists();
				}); // listSplice
			} // need chop
			else {
				self.logDebug(4, "No maintenace required on " + timeline_key + ", moving to next set");
				self.chopLists();
			}
		}); // listGetInfo
	},
	
	chopLists: function() {
		// chop long lists (part of daily maint)
		var self = this;
		var max_rows = this.server.config.get('list_row_max') || 0;
		if (!max_rows) {
			this.logDebug(4, "Maintenance complete");
			return;
		}
		
		var list_paths = ['logs/activity', 'logs/snapshots'];
		this.logDebug(4, "Continuing maintenance on lists", list_paths);
		
		async.eachSeries( list_paths, 
			function(list_path, callback) {
				// iterator function, work on single list
				self.logDebug(4, "Working on list: " + list_path);
				
				self.storage.listGetInfo( list_path, function(err, info) {
					// list may not exist, skip if so
					if (err) {
						self.logError('maint', "Maintenance Error: " + err + " (skipping list: " + list_path + ")");
						return callback();
					}
					
					// check list length
					if (info.length > max_rows) {
						// list has grown too long, needs a trim
						self.logDebug(3, "List " + list_path + " has grown too long, trimming to max: " + max_rows, info);
						self.storage.listSplice( list_path, max_rows, info.length - max_rows, null, callback );
					}
					else {
						// no trim needed, proceed to next list
						self.logDebug(4, "List is within limits, no maint required: " + list_path, info);
						callback();
					}
				} ); // get list info
			}, // iterator
			function(err) {
				if (err) {
					self.logError('maint', "Failed to trim lists: " + err);
				}
				
				// done with maint
				self.logDebug(4, "Maintenance complete");
			} // complete
		); // eachSeries
	},
	
	archiveLogs: function() {
		// archive all logs (called once daily at midnight)
		// log_archive_storage: { enabled, key_template, expiration }
		var self = this;
		var src_spec = this.server.config.get('log_dir') + '/*.log';
		
		if (this.server.config.get('log_archive_path')) {
			// archive to filesystem (not storage)
			var dest_path = this.server.config.get('log_archive_path');
			this.logDebug(4, "Archiving logs: " + src_spec + " to: " + dest_path);
			
			// generate time label from previous day, so just subtracting 30 minutes to be safe
			var epoch = Tools.timeNow(true) - 1800;
			
			this.logger.archive(src_spec, dest_path, epoch, function(err) {
				if (err) self.logError('maint', "Failed to archive logs: " + err);
				else self.logDebug(4, "Log archival complete");
			});
			
			return;
		}
		
		// archive to storage (i.e. S3, etc.)
		var arch_conf = this.server.config.get('log_archive_storage');
		if (!arch_conf || !arch_conf.enabled) return;
		
		var exp_date = 0;
		if (arch_conf.expiration) {
			exp_date = Tools.timeNow() + Tools.getSecondsFromText( arch_conf.expiration );
		}
		
		this.logDebug(4, "Archiving logs: " + src_spec + " to: " + arch_conf.key_template, arch_conf);
		
		// generate time label from previous day, so just subtracting 30 minutes to be safe
		var epoch = Tools.timeNow(true) - 1800;
		
		// fill date/time placeholders
		var dargs = Tools.getDateArgs( epoch );
		
		glob(src_spec, {}, function (err, files) {
			if (err) return callback(err);
			
			// got files
			if (files && files.length) {
				async.eachSeries( files, function(src_file, callback) {
					// foreach file
					
					// add filename to args
					dargs.filename = Path.basename(src_file).replace(/\.\w+$/, '');
					
					// construct final storage key
					var storage_key = Tools.sub( arch_conf.key_template, dargs );
					self.logDebug(5, "Archiving log: " + src_file + " to: " + storage_key);
					
					// rename local log first
					var src_temp_file = src_file + '.' + Tools.generateUniqueID(32) + '.tmp';
					
					fs.rename(src_file, src_temp_file, function(err) {
						if (err) {
							return callback( new Error("Failed to rename: " + src_file + " to: " + src_temp_file + ": " + err) );
						}
						
						if (storage_key.match(/\.gz$/i)) {
							// gzip the log archive
							var gzip = zlib.createGzip();
							var inp = fs.createReadStream( src_temp_file );
							inp.pipe(gzip);
							
							self.storage.putStream( storage_key, gzip, function(err) {
								// all done, delete temp file
								fs.unlink( src_temp_file, function(uerr) {
									if (uerr) self.logError('maint', "Failed to delete temp file: " + src_temp_file + ": " + uerr);
									if (err) return callback(err);
									if (exp_date) self.storage.expire( storage_key, exp_date );
									callback();
								} );
							}); // putStream
						} // gzip
						else {
							// straight copy (no compress)
							var inp = fs.createReadStream( src_temp_file );
							
							self.storage.putStream( storage_key, inp, function(err) {
								// all done, delete temp file
								fs.unlink( src_temp_file, function(ul_err) {
									if (ul_err) self.logError('maint', "Failed to delete temp file: " + src_temp_file + ": " + ul_err);
									if (err) return callback(err);
									if (exp_date) self.storage.expire( storage_key, exp_date );
									callback();
								} );
							}); // putStream
						} // copy
					} ); // fs.rename
				}, 
				function(err) {
					if (err) self.logError('maint', "Failed to archive logs: " + err);
					else self.logDebug(4, "Log archival complete");
				}); // eachSeries
			} // got files
			else {
				self.logDebug(9, "Log Archive: No log files found matching: " + src_spec);
			}
		} ); // glob
	},
	
	corsPreflight: function(args, callback) {
		// handler for HTTP OPTIONS calls (CORS AJAX preflight)
		callback( "200 OK", 
			{
				'Access-Control-Allow-Origin': args.request.headers['origin'] || "*",
				'Access-Control-Allow-Methods': "POST, GET, HEAD, OPTIONS",
				'Access-Control-Allow-Headers': args.request.headers['access-control-request-headers'] || "*",
				'Access-Control-Max-Age': "1728000",
				'Content-Length': "0"
			},
			null
		);
	},
	
	logActivity: function(action, orig_data) {
		// add event to activity logs async
		var self = this;
		
		assert( Tools.isaHash(orig_data), "Must pass a data object to logActivity" );
		var data = Tools.copyHash( orig_data, true );
		
		data.action = action;
		data.epoch = Tools.timeNow(true);
		
		this.storage.enqueue( function(task, callback) {
			self.storage.listUnshift( 'logs/activity', data, callback );
		});
		
		// optional web hook for system actions
		var sys_hooks = this.server.config.get('system_web_hooks');
		if (sys_hooks && sys_hooks[action]) {
			var web_hook_url = sys_hooks[action];
			if (typeof(web_hook_url) != 'string') web_hook_url = this.server.config.get('alert_web_hook');
			if (!web_hook_url) return;
			
			var hook_args = Tools.copyHash(data);
			if (!hook_args.text && hook_args.description) {
				hook_args.text = hook_args.description;
			}
			delete hook_args.description;
			hook_args.text = this.server.config.getPath('client/name') + ": " + hook_args.text;
			this.logDebug(9, "Firing web hook for " + action + ": " + web_hook_url);
			this.request.json( web_hook_url, hook_args, function(err, resp, data) {
				// log response
				if (err) self.logDebug(9, "Web Hook Error: " + web_hook_url + ": " + err);
				else self.logDebug(9, "Web Hook Response: " + web_hook_url + ": HTTP " + resp.statusCode + " " + resp.statusMessage);
			} );
		}
	},
	
	logTransaction: function(code, msg, data) {
		// proxy request to system logger with correct component for dedi trans log
		this.logger.set( 'component', 'Transaction' );
		this.logger.transaction( code, msg, data );
		
		if (!data) data = {};
		if (!data.description) data.description = msg;
		this.logActivity(code, data);
	},
	
	shutdown: function(callback) {
		// shutdown sequence
		var self = this;
		this.shut = true;
		this.logDebug(2, "Shutting down Performa");
		callback();
	}
	
});
