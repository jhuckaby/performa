// Performa API Layer - Commands
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');

var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_get_commands: function(args, callback) {
		// get list of all commands
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'global/commands', 0, 0, function(err, items, list) {
				if (err) {
					// no items found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return items and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got command list
		} ); // loaded session
	},
	
	api_get_command: function(args, callback) {
		// get single command for editing
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listFind( 'global/commands', { id: params.id }, function(err, item) {
				if (err || !item) {
					return self.doError('command', "Failed to locate command: " + params.id, callback);
				}
				
				// success, return item
				callback({ code: 0, command: item });
			} ); // got command
		} ); // loaded session
	},
	
	api_create_command: function(args, callback) {
		// add new command
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
			exec: /\S/,
			group_match: /\S/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.username = user.username;
			params.created = params.modified = Tools.timeNow(true);
			
			self.logDebug(6, "Creating new command: " + params.title, params);
			
			self.storage.listPush( 'global/commands', params, function(err) {
				if (err) {
					return self.doError('command', "Failed to create command: " + err, callback);
				}
				
				self.logDebug(6, "Successfully created command: " + params.title, params);
				self.logTransaction('command_create', params.title, self.getClientInfo(args, { command: params }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/commands', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache commands: " + err);
						return;
					}
					self.commands = items;
				});
			} ); // listPush
		} ); // loadSession
	},
	
	api_update_command: function(args, callback) {
		// update existing command
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
			
			self.logDebug(6, "Updating command: " + params.id, params);
			
			self.storage.listFindUpdate( 'global/commands', { id: params.id }, params, function(err, command) {
				if (err) {
					return self.doError('command', "Failed to update command: " + err, callback);
				}
				
				self.logDebug(6, "Successfully updated command: " + command.title, params);
				self.logTransaction('command_update', command.title, self.getClientInfo(args, { command: command }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/commands', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache commands: " + err);
						return;
					}
					self.commands = items;
				});
			} ); // listFindUpdate
		} ); // loadSession
	},
	
	api_delete_command: function(args, callback) {
		// delete existing command
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
			
			self.logDebug(6, "Deleting command: " + params.id, params);
			
			self.storage.listFindDelete( 'global/commands', { id: params.id }, function(err, command) {
				if (err) {
					return self.doError('command', "Failed to delete command: " + err, callback);
				}
				
				self.logDebug(6, "Successfully deleted command: " + command.title, command);
				self.logTransaction('command_delete', command.title, self.getClientInfo(args, { command: command }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/commands', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache commands: " + err);
						return;
					}
					self.commands = items;
				});
			} ); // listFindDelete
		} ); // loadSession
	}
	
} );
