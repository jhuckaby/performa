// Performa API Layer - Configuration
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var assert = require("assert");
var async = require('async');
var Class = require("pixl-class");
var Tools = require("pixl-tools");

module.exports = Class.create({
	
	api_config: function(args, callback) {
		// send config to client
		var self = this;
		
		// do not cache this API response
		this.forceNoCacheResponse(args);
		
		var resp = {
			code: 0,
			version: this.server.__version,
			config: Tools.mergeHashes( this.server.config.get('client'), {
				debug: this.server.debug ? 1 : 0,
				base_app_url: this.server.config.get('base_app_url'),
				base_api_uri: this.api.config.get('base_uri'),
				default_privileges: this.usermgr.config.get('default_privileges'),
				free_accounts: this.usermgr.config.get('free_accounts'),
				external_users: this.usermgr.config.get('external_user_api') ? 1 : 0,
				external_user_api: this.usermgr.config.get('external_user_api') || '',
				hostname_display_strip: this.server.config.get('hostname_display_strip'),
				groups: this.groups,
				monitors: this.monitors,
				alerts: this.alerts,
				commands: this.commands,
				state: this.state,
				systems: this.systems
			} ),
			port: args.request.headers.ssl ? this.web.config.get('https_port') : this.web.config.get('http_port')
		};
		
		// get all contributors for current day, for populating the UI 'Jump to Server' dropdown menu
		var dargs = Tools.getDateArgs( new Date() );
		this.storage.get( 'contrib/daily/' + dargs.yyyy_mm_dd, function(err, data) {
			var hostnames = {};
			
			if (data && data.hostnames) {
				hostnames = data.hostnames;
				Tools.hashKeysToArray(hostnames).forEach( function(hostname) {
					// convert autoscale hostnames
					if (hostname.match(/^(\w+)\/(.+)$/)) {
						hostnames[ RegExp.$2 ] = RegExp.$1;
						delete hostnames[hostname];
					}
				});
			}
			
			if (self.hostnameCache.hourly) {
				// add in cached hostnames not yet written to storage
				for (var hostname in self.hostnameCache.hourly) {
					if (hostname.match(/^(\w+)\/(.+)$/)) {
						hostnames[ RegExp.$2 ] = RegExp.$1;
					}
					else {
						hostnames[hostname] = 1;
					}
				}
			} // hourly cache
			
			// massage first-time user experience:
			// if no hostnames found but `monitor_self` config is set, inject current hostname
			if (!Tools.numKeys(hostnames) && self.server.config.get('monitor_self')) {
				hostnames[ self.server.hostname ] = 1;
			}
			
			resp.recent_hostnames = hostnames;
			callback(resp);
		}); // storage.get
	}
	
} );
