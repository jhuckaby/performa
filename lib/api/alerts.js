// Performa API Layer - Alerts
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');

var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_get_alerts: function(args, callback) {
		// get list of all alerts
		var self = this;
		var params = args.params;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listGet( 'global/alerts', 0, 0, function(err, items, list) {
				if (err) {
					// no items found, not an error for this API
					return callback({ code: 0, rows: [], list: { length: 0 } });
				}
				
				// success, return items and list header
				callback({ code: 0, rows: items, list: list });
			} ); // got alert list
		} ); // loaded session
	},
	
	api_get_alert: function(args, callback) {
		// get single alert for editing
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			self.storage.listFind( 'global/alerts', { id: params.id }, function(err, item) {
				if (err || !item) {
					return self.doError('alert', "Failed to locate alert: " + params.id, callback);
				}
				
				// success, return item
				callback({ code: 0, alert: item });
			} ); // got alert
		} ); // loaded session
	},
	
	api_create_alert: function(args, callback) {
		// add new alert
		var self = this;
		var params = args.params;
		
		if (!this.requireParams(params, {
			id: /^\w+$/,
			title: /\S/,
			expression: /\S/,
			message: /\S/,
			group_match: /\S/
		}, callback)) return;
		
		this.loadSession(args, function(err, session, user) {
			if (err) return self.doError('session', err.message, callback);
			if (!self.requireAdmin(session, user, callback)) return;
			
			args.user = user;
			args.session = session;
			
			params.username = user.username;
			params.created = params.modified = Tools.timeNow(true);
			
			self.logDebug(6, "Creating new alert: " + params.title, params);
			
			self.storage.listPush( 'global/alerts', params, function(err) {
				if (err) {
					return self.doError('alert', "Failed to create alert: " + err, callback);
				}
				
				self.logDebug(6, "Successfully created alert: " + params.title, params);
				self.logTransaction('alert_create', params.title, self.getClientInfo(args, { alert: params }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/alerts', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache alerts: " + err);
						return;
					}
					self.alerts = items;
				});
			} ); // listPush
		} ); // loadSession
	},
	
	api_update_alert: function(args, callback) {
		// update existing alert
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
			
			self.logDebug(6, "Updating alert: " + params.id, params);
			
			self.storage.listFindUpdate( 'global/alerts', { id: params.id }, params, function(err, alert) {
				if (err) {
					return self.doError('alert', "Failed to update alert: " + err, callback);
				}
				
				self.logDebug(6, "Successfully updated alert: " + alert.title, params);
				self.logTransaction('alert_update', alert.title, self.getClientInfo(args, { alert: alert }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/alerts', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache alerts: " + err);
						return;
					}
					self.alerts = items;
				});
			} ); // listFindUpdate
		} ); // loadSession
	},
	
	api_delete_alert: function(args, callback) {
		// delete existing alert
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
			
			self.logDebug(6, "Deleting alert: " + params.id, params);
			
			self.storage.listFindDelete( 'global/alerts', { id: params.id }, function(err, alert) {
				if (err) {
					return self.doError('alert', "Failed to delete alert: " + err, callback);
				}
				
				self.logDebug(6, "Successfully deleted alert: " + alert.title, alert);
				self.logTransaction('alert_delete', alert.title, self.getClientInfo(args, { alert: alert }));
				
				callback({ code: 0 });
				
				// update cache in background
				self.storage.listGet( 'global/alerts', 0, 0, function(err, items) {
					if (err) {
						// this should never fail, as it should already be cached
						self.logError('storage', "Failed to cache alerts: " + err);
						return;
					}
					self.alerts = items;
				});
			} ); // listFindDelete
		} ); // loadSession
	}
	
} );
