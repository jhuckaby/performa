// Performa API Layer - Data View
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');
var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_contrib: function(args, callback) {
		// fetch all server contributors for a specific sample range
		// query: { sys, [group], [date | length] }
		var self = this;
		var query = args.query;
		var group_defs = this.groups;
		var group_def = null;
		var hostname_match = /.+/;
		var group_prefix_match = /(?!)/;
		
		if (!this.requireParams(query, {
			sys: /^\w+$/
		}, callback)) return;
			
		var sys = Tools.findObject( this.systems, { id: query.sys } );
		if (!sys) return this.doError('contrib', "Could not find system definition: " + query.sys, callback);
		
		if (query.group) {
			group_def = Tools.findObject( group_defs, { id: query.group } );
			if (!group_def) return this.doError('contrib', "Could not find group definition: " + query.group, callback);
			hostname_match = new RegExp( group_def.hostname_match );
			group_prefix_match = new RegExp( '^' + Tools.escapeRegExp(group_def.id) + "/(.+)$" );
		}
		
		var finish = function(items) {
			// extract matching hostnames from items and return
			// only include valid hostnames from the sample set
			var final_hostnames = {};
			
			items.forEach( function(item) {
				for (var hostname in item.hostnames) {
					if (hostname.match(group_prefix_match)) {
						// auto-scale host with group prefix, e.g. mtx/1234.internal
						final_hostnames[ RegExp.$1 ] = group_def.id;
					}
					else if (!hostname.match(/\//) && hostname.match(hostname_match)) {
						final_hostnames[hostname] = 1;
					}
				}
			}); // items.forEach
			
			if (query.length && (query.sys == 'hourly') && self.hostnameCache.hourly) {
				// real-time query, add in cached hostnames not yet written to storage
				for (var hostname in self.hostnameCache.hourly) {
					if (hostname.match(group_prefix_match)) {
						// auto-scale host with group prefix, e.g. mtx/1234.internal
						final_hostnames[ RegExp.$1 ] = group_def.id;
					}
					else if (!hostname.match(/\//) && hostname.match(hostname_match)) {
						final_hostnames[hostname] = 1;
					}
				}
			} // real-time
			
			callback({
				code: 0,
				hostnames: final_hostnames
			});
		}; // finish
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			// branch for historical or real-time mode
			if (query.date) {
				// exact date, easy mode
				var contrib_key = 'contrib/' + sys.id + '/' + query.date;
				self.storage.get( contrib_key, function(err, data) {
					var items = (data && data.hostnames) ? [data] : [];
					finish( items );
				}); // storage.get
			}
			else if (query.length && (query.sys == 'hourly')) {
				// real-time query, not so easy
				query.length = parseInt( query.length );
				var len = Math.floor( query.length / 60 ) + 1;
				var now = Tools.timeNow();
				var keys = [];
				var items = [];
				
				for (var idx = 0; idx < len; idx++) {
					var dargs = Tools.getDateArgs( now - (idx * 3600) );
					keys.push( 'contrib/' + sys.id + '/' + Tools.sub(sys.date_format, dargs) );
				}
				
				// load multiple records as quickly as possible using concurrency
				async.eachLimit( keys, self.storage.concurrency,
					function(key, callback) {
						self.storage.get( key, function(err, data) {
							// ignore errors here
							if (data && data.hostnames) items.push( data );
							callback();
						}); // storage.listGet
					},
					function() {
						// finish up
						finish( items );
					}
				); // async.eachLimit
			}
			else {
				// malformed request
				return self.doError('contrib', "Missing both date and length properties", callback);
			}
		}); // loadSession
	},
	
	api_view: function(args, callback) {
		// view data samples from one specified server
		// query: { sys, hostname, (date | length) }
		var self = this;
		var query = args.query;
		
		if (!this.requireParams(query, {
			// sys: /^\w+$/,
			hostname: /^[\w\-\.]+$/
		}, callback)) return;
		
		if (!query.sys) query.sys = 'hourly';
		var sys = Tools.findObject( this.systems, { id: query.sys } );
		if (!sys) return this.doError('view', "Could not find system definition: " + query.sys, callback);
		
		var finish = function(items) {
			// load server metadata and send response
			var host_key = 'hosts/' + query.hostname + '/data';
			self.storage.get( host_key, function(err, data) {
				if (err || !data) return self.doError('no_data', "No data found", callback);
				
				// if not in verbose mode, strip extraneous data
				if (!args.request.url.match(/\/verbose/)) {
					if (!data.data) data.data = {};
					delete data.data.stats;
					delete data.data.mounts;
					delete data.data.processes;
				}
				
				callback({ 
					code: 0, 
					hostname: query.hostname,
					rows: items,
					metadata: data
				});
			}); // storage.get
		}; // finish
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			// branch for historical or real-time view
			if (query.date) {
				// exact date, easy mode
				var timeline_key = 'timeline/' + sys.id + '/' + query.hostname + '/' + query.date;
				
				self.storage.listGet( timeline_key, 0, 0, function(err, items) {
					if (err || !items || !items.length) return self.doError('no_data', "No data found", callback);
					finish( items );
				}); // storage.listGet
			}
			else if (query.length && (query.sys == 'hourly')) {
				// real-time view (will involve multiple lists)
				query.length = parseInt( query.length );
				var len = Math.floor( query.length / 60 ) + 1;
				var now = Tools.timeNow();
				var keys = [];
				var values = {};
				
				for (var idx = 0; idx < len; idx++) {
					var dargs = Tools.getDateArgs( now - (idx * 3600) );
					keys.push( 'timeline/' + sys.id + '/' + query.hostname + '/' + Tools.sub(sys.date_format, dargs) );
				}
				
				// load multiple lists as quickly as possible using concurrency
				async.eachLimit( keys, self.storage.concurrency,
					function(key, callback) {
						self.storage.listGet( key, 0, 0, function(err, items) {
							// ignore errors here
							if (items && items.length) values[key] = items;
							callback();
						}); // storage.listGet
					},
					function() {
						// arrange all rows by date ascending
						var items = [];
						keys.reverse().forEach( function(key) {
							if (values[key]) items = items.concat( values[key] );
						});
						
						if (!items.length) {
							return self.doError('no_data', "No data found", callback);
						}
						
						// splice off extra from left (oldest) side, if applicable
						if (items.length > query.length) {
							items.splice( 0, items.length - query.length );
						}
						
						finish( items );
					}
				); // async.eachLimit
			}
			else {
				// no date or length, just return host data
				finish([]);
			}
		}); // loadSession
	},
	
	api_overview: function(args, callback) {
		// view data samples from overview summary data (all groups)
		// query: { offset, length }
		var self = this;
		var query = args.query;
		
		if (!this.requireParams(query, {
			offset: /^\-?\d+$/,
			length: /^\-?\d+$/
		}, callback)) return;
		
		var timeline_key = 'timeline/overview';
		var offset = parseInt( query.offset );
		var length = parseInt( query.length );
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
		
			self.storage.listGet( timeline_key, offset, length, function(err, items) {
				if (err || !items || !items.length) return self.doError('no_data', "No data found", callback);
				
				// also load current alerts
				self.storage.get( 'current/alerts', function(err, alert_data) {
					if (err || !alert_data) alert_data = {};
					
					callback({ code: 0, rows: items, alerts: alert_data });
				}); // storage.get
			}); // storage.listGet
		}); // loadSession
	},
	
	api_get_snapshots: function(args, callback) {
		// get rows from snapshots log (with pagination)
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			self.storage.listGet( 'logs/snapshots', parseInt(params.offset || 0), parseInt(params.limit || 50), function(err, items, list) {
				if (err) {
					// no rows found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return rows and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got data
		} ); // loaded session
	},
	
	api_get_snapshot: function(args, callback) {
		// get single snapshot given id
		var self = this;
		var query = args.query;
		
		if (!this.requireParams(query, {
			id: /^\S+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireValidUser(session, user, callback)) return;
			
			var snap_key = 'snapshots/' + query.id;
			self.storage.get( snap_key, function(err, data) {
				if (err || !data) return self.doError('no_data', "No data found", callback);
				
				callback({ 
					code: 0, 
					metadata: data
				});
			}); // storage.get
		}); // loadSession
	}

}); // class
