// Performa API Layer - Groups
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');

var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_get_groups: function(args, callback) {
		// get list of all groups
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'global/groups', 0, 0, function(err, items, list) {
				if (err) {
					// no items found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return items and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got group list
		} ); // loaded session
	},
	
	api_get_group: function(args, callback) {
		// get single group for editing
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listFind( 'global/groups', { id: params.id }, function(err, item) {
				if (err || !item) {
					return self.doError('group', "Failed to locate group: " + params.id, callback);
				}
				
				// success, return item
				callback({ code: 0, group: item });
			} ); // got group
		} ); // loaded session
	},
	
	api_create_group: function(args, callback) {
		// add new group
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
			hostname_match: /\S/
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
			self.groups.forEach( function(group_def) {
				if (group_def.sort_order > params.sort_order) params.sort_order = group_def.sort_order;
			});
			params.sort_order++;
			
			self.logDebug(6, "Creating new group: " + params.title, params);
			
			self.storage.listPush( 'global/groups', params, function(err) {
				if (err) {
					return self.doError('group', "Failed to create group: " + err, callback);
				}
				
				self.logDebug(6, "Successfully created group: " + params.title, params);
				self.logTransaction('group_create', params.title, self.getClientInfo(args, { group: params }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/groups', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache groups: " + err);
						return;
					}
					self.groups = items;
				});
			} ); // listPush
		} ); // loadSession
	},
	
	api_update_group: function(args, callback) {
		// update existing group
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
			
			self.logDebug(6, "Updating group: " + params.id, params);
			
			self.storage.listFindUpdate( 'global/groups', { id: params.id }, params, function(err, group) {
				if (err) {
					return self.doError('group', "Failed to update group: " + err, callback);
				}
				
				self.logDebug(6, "Successfully updated group: " + group.title, params);
				self.logTransaction('group_update', group.title, self.getClientInfo(args, { group: group }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/groups', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache groups: " + err);
						return;
					}
					self.groups = items;
				});
			} ); // listFindUpdate
		} ); // loadSession
	},
	
	api_delete_group: function(args, callback) {
		// delete existing group
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
			
			self.logDebug(6, "Deleting group: " + params.id, params);
			
			self.storage.listFindDelete( 'global/groups', { id: params.id }, function(err, group) {
				if (err) {
					return self.doError('group', "Failed to delete group: " + err, callback);
				}
				
				self.logDebug(6, "Successfully deleted group: " + group.title, group);
				self.logTransaction('group_delete', group.title, self.getClientInfo(args, { group: group }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/groups', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache groups: " + err);
						return;
					}
					self.groups = items;
				});
			} ); // listFindDelete
		} ); // loadSession
	},
	
	api_multi_update_group: function(args, callback) {
		// update multiple groups in one call, i.e. sort_order
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
			
			self.logDebug(9, "Performing multi-group update", params);
			
			// convert item array to hash for quick matches in loop
			var update_map = {};
			for (var idx = 0, len = params.items.length; idx < len; idx++) {
				var item = params.items[idx];
				if (item.id) update_map[ item.id ] = item;
			}
			
			self.storage.listEachPageUpdate( 'global/groups',
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
					
					self.logDebug(6, "Successfully updated multiple groups");
					self.logTransaction('group_multi_update', '', self.getClientInfo(args, { 
						updated: Tools.hashKeysToArray( Tools.copyHashRemoveKeys(params.items[0], { id:1 }) ) 
					}));
					
					callback({ code: 0 });
					
					// update cache in background
					self.storage.listGet( 'global/groups', 0, 0, function(err, items) {
						if (err) {
							// this should never fail, as it should already be cached
							self.logError('storage', "Failed to cache groups: " + err);
							return;
						}
						self.groups = items;
					});
				}
			); // listEachPageUpdate
		}); // loadSession
	}
	
} );
