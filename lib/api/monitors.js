// Performa API Layer - Monitors
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');

var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_get_monitors: function(args, callback) {
		// get list of all monitors
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'global/monitors', 0, 0, function(err, items, list) {
				if (err) {
					// no items found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return items and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got monitor list
		} ); // loaded session
	},
	
	api_get_monitor: function(args, callback) {
		// get single monitor for editing
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listFind( 'global/monitors', { id: params.id }, function(err, item) {
				if (err || !item) {
					return self.doError('monitor', "Failed to locate monitor: " + params.id, callback);
				}
				
				// success, return item
				callback({ code: 0, monitor: item });
			} ); // got monitor
		} ); // loaded session
	},
	
	api_create_monitor: function(args, callback) {
		// add new monitor
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
			source: /\S/,
			data_type: /^\w+$/,
			group_match: /\S/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.username = user.username;
			params.created = params.modified = Tools.timeNow(true);
			
			// deleting will produce a "hole" in the sort orders, so we have to find the max + 1
			params.sort_order = -1;
			self.monitors.forEach( function(mon_def) {
				if (mon_def.sort_order > params.sort_order) params.sort_order = mon_def.sort_order;
			});
			params.sort_order++;
			
			self.logDebug(6, "Creating new monitor: " + params.title, params);
			
			self.storage.listPush( 'global/monitors', params, function(err) {
				if (err) {
					return self.doError('monitor', "Failed to create monitor: " + err, callback);
				}
				
				self.logDebug(6, "Successfully created monitor: " + params.title, params);
				self.logTransaction('monitor_create', params.title, self.getClientInfo(args, { monitor: params }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/monitors', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache monitors: " + err);
						return;
					}
					self.monitors = items;
				});
			} ); // listPush
		} ); // loadSession
	},
	
	api_update_monitor: function(args, callback) {
		// update existing monitor
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.modified = Tools.timeNow(true);
			
			self.logDebug(6, "Updating monitor: " + params.id, params);
			
			self.storage.listFindUpdate( 'global/monitors', { id: params.id }, params, function(err, monitor) {
				if (err) {
					return self.doError('monitor', "Failed to update monitor: " + err, callback);
				}
				
				self.logDebug(6, "Successfully updated monitor: " + monitor.title, params);
				self.logTransaction('monitor_update', monitor.title, self.getClientInfo(args, { monitor: monitor }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/monitors', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache monitors: " + err);
						return;
					}
					self.monitors = items;
				});
			} ); // listFindUpdate
		} ); // loadSession
	},
	
	api_delete_monitor: function(args, callback) {
		// delete existing monitor
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			self.logDebug(6, "Deleting monitor: " + params.id, params);
			
			self.storage.listFindDelete( 'global/monitors', { id: params.id }, function(err, monitor) {
				if (err) {
					return self.doError('monitor', "Failed to delete monitor: " + err, callback);
				}
				
				self.logDebug(6, "Successfully deleted monitor: " + monitor.title, monitor);
				self.logTransaction('monitor_delete', monitor.title, self.getClientInfo(args, { monitor: monitor }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/monitors', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache monitors: " + err);
						return;
					}
					self.monitors = items;
				});
			} ); // listFindDelete
		} ); // loadSession
	},
	
	api_multi_update_monitor: function(args, callback) {
		// update multiple monitors in one call, i.e. sort_order
		var self = this;
		var params = args.params;
		
		if (!params.items || !params.items.length) {
			return this.doError('session', "Request missing 'items' parameter, or has zero length.", callback);
		}
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			self.logDebug(9, "Performing multi-monitor update", params);
			
			// convert item array to hash for quick matches in loop
			var update_map = {};
			for (var idx = 0, len = params.items.length; idx < len; idx++) {
				var item = params.items[idx];
				if (item.id) update_map[ item.id ] = item;
			}
			
			self.storage.listEachPageUpdate( 'global/monitors',
				function(items, callback) {
					// update page
					var num_updates = 0;
					
					for (var idx = 0, len = items.length; idx < len; idx++) {
						var item = items[idx];
						if (item.id && (item.id in update_map)) {
							Tools.mergeHashInto( item, update_map[item.id] );
							num_updates++;
						}
					}
					
					callback( null, !!num_updates );
				},
				function(err) {
					if (err) return callback(err);
					
					self.logDebug(6, "Successfully updated multiple monitors");
					self.logTransaction('monitor_multi_update', '', self.getClientInfo(args, { 
						updated: Tools.hashKeysToArray( Tools.copyHashRemoveKeys(params.items[0], { id:1 }) ) 
					}));
					
					callback({ code: 0 });
					
					// update cache in background
					self.storage.listGet( 'global/monitors', 0, 0, function(err, items) {
						if (err) {
							// this should never fail, as it should already be cached
							self.logError('storage', "Failed to cache monitors: " + err);
							return;
						}
						self.monitors = items;
					});
				}
			); // listEachPageUpdate
		}); // loadSession
	}
	
} );
