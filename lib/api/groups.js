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
	
	api_swap_group_props: function(args, callback) {
		// swap specified key of two groups (a, b, key)
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			a: /^\w+$/, // id of first group
			b: /^\w+$/, // id of second group
			key: /^\w+$/ // key to swap, e.g. sort_order
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			var a = Tools.findObject( self.groups, { id: params.a } );
			if (!a) return self.doError('group', "Cannot find group with ID: " + params.a, callback);
			
			var b = Tools.findObject( self.groups, { id: params.b } );
			if (!b) return self.doError('group', "Cannot find group with ID: " + params.b, callback);
			
			var a_value = a[ params.key ];
			var b_value = b[ params.key ];
			
			async.series(
				[
					function(callback) {
						// update group A with B's value
						var updates = {};
						updates[ params.key ] = b_value;
						
						self.storage.listFindUpdate( 'global/groups', { id: params.a }, updates, function(err, group) {
							if (err) return callback(err);
							
							self.logDebug(6, "Successfully updated group: " + group.title, params);
							self.logTransaction('group_update', group.title, self.getClientInfo(args, { group: group }));
							
							callback();
						}); // listFindUpdate
					},
					function(callback) {
						// update group B with A's value
						var updates = {};
						updates[ params.key ] = a_value;
						
						self.storage.listFindUpdate( 'global/groups', { id: params.b }, updates, function(err, group) {
							if (err) return callback(err);
							
							self.logDebug(6, "Successfully updated group: " + group.title, params);
							self.logTransaction('group_update', group.title, self.getClientInfo(args, { group: group }));
							
							callback();
						}); // listFindUpdate
					}
				],
				function(err) {
					if (err) {
						self.doError('group', "Could not update groups: " + err, callback);
					}
					
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
				} // done
			); // async.series
		}); // loadSession
	}
	
} );
