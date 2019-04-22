// Performa API Layer - Administrative
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');

var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_get_activity: function(args, callback) {
		// get rows from activity log (with pagination)
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'logs/activity', parseInt(params.offset || 0), parseInt(params.limit || 50), function(err, items, list) {
				if (err) {
					// no rows found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return rows and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got data
		} ); // loaded session
	},
	
	api_update_state: function(args, callback) {
		// update state (i.e. alert snooze)
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			// import params into state
			self.logDebug(4, "Updating state:", params);
			self.logTransaction('state_update', 'State data updated', self.getClientInfo(args, params));
			
			Tools.mergeHashInto( self.state, params );
			
			callback({ code: 0 });
			
			// write state async
			self.storage.put( 'global/state', self.state, function(err) {
				if (err) self.logError('state', "Failed to write state data: " + err);
			});
		} );
	},
	
	api_watch: function(args, callback) {
		// set or unset a watch on one or more servers
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			// hostname: /^\S+$/,
			date: /^\d+$/
		}, callback)) return;
		
		if (!params.hostnames || !params.hostnames.length || (typeof(params.hostnames) != 'object')) {
			return this.doError('watch', "Missing or malformed 'hostnames' parameter.", callback);
		}
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			// set or unset watch
			if (!self.state.watches) self.state.watches = {};
			
			params.hostnames.forEach( function(hostname) {
				if (params.date) {
					self.state.watches[ hostname ] = params.date;
				}
				else {
					// remove watch
					delete self.state.watches[ hostname ];
				}
			}); // forEach
			
			// import params into state
			self.logDebug(4, "Updating state:", self.state);
			self.logTransaction('watch_set', 'Server watch has been set', self.getClientInfo(args, params));
			
			callback({ code: 0 });
			
			// write state async
			self.storage.put( 'global/state', self.state, function(err) {
				if (err) self.logError('state', "Failed to write state data: " + err);
			});
		} );
	}
	
} );
