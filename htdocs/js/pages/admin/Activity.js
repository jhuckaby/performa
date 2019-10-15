// Cronicle Admin Page -- Activity Log

Class.add( Page.Admin, {
	
	activity_types: {
		'^group': '<i class="mdi mdi-server-network">&nbsp;</i>Group',
		'^monitor': '<i class="mdi mdi-chart-line">&nbsp;</i>Monitor',
		'^alert_cleared$': '<i class="mdi mdi-bell-off">&nbsp;</i>Alert',
		'^alert': '<i class="mdi mdi-bell">&nbsp;</i>Alert',
		'^command': '<i class="mdi mdi-console">&nbsp;</i>Command',
		'^apikey': '<i class="mdi mdi-key-variant">&nbsp;</i>API Key',	
		'^user': '<i class="fa fa-user">&nbsp;</i>User',
		'^server': '<i class="mdi mdi-desktop-tower mdi-lg">&nbsp;</i>Server',
		'^state': '<i class="mdi mdi-calendar-clock">&nbsp;</i>State', // mdi-lg
		'^watch': '<i class="mdi mdi-history">&nbsp;</i>Watch', // mdi-lg
		'^error': '<i class="fa fa-exclamation-triangle">&nbsp;</i>Error',
		'^warning': '<i class="fa fa-exclamation-circle">&nbsp;</i>Warning'
	},
	
	gosub_activity: function(args) {
		// show activity log
		app.setWindowTitle( "Activity Log" );
		
		if (!args.offset) args.offset = 0;
		if (!args.limit) args.limit = 25;
		app.api.post( 'app/get_activity', copy_object(args), this.receive_activity.bind(this) );
	},
	
	receive_activity: function(resp) {
		// receive page of activity from server, render it
		this.lastActivityResp = resp;
		
		var html = '';
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'activity',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		this.events = [];
		if (resp.rows) this.events = resp.rows;
		
		var cols = ['Date/Time', 'Type', 'Description', 'Username', 'IP Address', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Activity Log';
			// html += '<div class="clear"></div>';
		html += '</div>';
		
		var self = this;
		html += this.getPaginatedTable( resp, cols, 'item', function(item, idx) {
			// figure out icon first
			if (!item.action) item.action = 'unknown';
			
			var item_type = '';
			for (var key in self.activity_types) {
				var regexp = new RegExp(key);
				if (item.action.match(regexp)) {
					item_type = self.activity_types[key];
					break;
				}
			}
			
			// compose nice description
			var desc = '';
			var actions = [];
			var color = '';
			
			switch (item.action) {
				
				// alerts
				case 'alert_create':
					desc = 'New alert created: <b>' + item.alert.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_alert&id='+item.alert.id+'">Edit Alert</a>' );
				break;
				case 'alert_update':
					desc = 'Alert updated: <b>' + item.alert.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_alert&id='+item.alert.id+'">Edit Alert</a>' );
				break;
				case 'alert_delete':
					desc = 'Alert deleted: <b>' + item.alert.title + '</b>';
				break;
				
				case 'alert_new':
					desc = 'Alert Triggered: <b>' + item.def.title + '</b> for server <b>' + self.formatHostname(item.hostname) + '</b>: ' + item.alert.message;
					color = 'red';
					actions.push( '<a href="#Snapshot?id=' + item.hostname + '/' + Math.floor( item.alert.date / 60 ) + '">View Snapshot</a>' );
					
				break;
				
				case 'alert_cleared':
					desc = 'Alert Cleared: <b>' + item.def.title + '</b> for server <b>' + self.formatHostname(item.hostname) + '.';
				break;
				
				// groups
				case 'group_create':
					desc = 'New group created: <b>' + item.group.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_group&id='+item.group.id+'">Edit Group</a>' );
				break;
				case 'group_update':
					desc = 'Group updated: <b>' + item.group.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_group&id='+item.group.id+'">Edit Group</a>' );
				break;
				case 'group_multi_update':
					desc = 'Group sort order changed.</b>';
				break;
				case 'group_delete':
					desc = 'Group deleted: <b>' + item.group.title + '</b>';
				break;
				
				// monitors
				case 'monitor_create':
					desc = 'New monitor created: <b>' + item.monitor.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_monitor&id='+item.monitor.id+'">Edit Monitor</a>' );
				break;
				case 'monitor_update':
					desc = 'Monitor updated: <b>' + item.monitor.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_monitor&id='+item.monitor.id+'">Edit Monitor</a>' );
				break;
				case 'monitor_multi_update':
					desc = 'Monitor sort order changed.</b>';
				break;
				case 'monitor_delete':
					desc = 'Monitor deleted: <b>' + item.monitor.title + '</b>';
				break;
				
				// commands
				case 'command_create':
					desc = 'New command created: <b>' + item.command.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_command&id='+item.command.id+'">Edit Command</a>' );
				break;
				case 'command_update':
					desc = 'Command updated: <b>' + item.command.title + '</b>';
					actions.push( '<a href="#Admin?sub=edit_command&id='+item.command.id+'">Edit Command</a>' );
				break;
				case 'command_delete':
					desc = 'Command deleted: <b>' + item.command.title + '</b>';
				break;
				
				// api keys
				case 'apikey_create':
					desc = 'New API Key created: <b>' + item.api_key.title + '</b> (Key: ' + item.api_key.key + ')';
					actions.push( '<a href="#Admin?sub=edit_api_key&id='+item.api_key.id+'">Edit Key</a>' );
				break;
				case 'apikey_update':
					desc = 'API Key updated: <b>' + item.api_key.title + '</b> (Key: ' + item.api_key.key + ')';
					actions.push( '<a href="#Admin?sub=edit_api_key&id='+item.api_key.id+'">Edit Key</a>' );
				break;
				case 'apikey_delete':
					desc = 'API Key deleted: <b>' + item.api_key.title + '</b> (Key: ' + item.api_key.key + ')';
				break;
				
				// users
				case 'user_create':
					desc = 'New user account created: <b>' + item.user.username + "</b> (" + item.user.full_name + ")";
					actions.push( '<a href="#Admin?sub=edit_user&username='+item.user.username+'">Edit User</a>' );
				break;
				case 'user_update':
					desc = 'User account updated: <b>' + item.user.username + "</b> (" + item.user.full_name + ")";
					actions.push( '<a href="#Admin?sub=edit_user&username='+item.user.username+'">Edit User</a>' );
				break;
				case 'user_delete':
					desc = 'User account deleted: <b>' + item.user.username + "</b> (" + item.user.full_name + ")";
				break;
				case 'user_login':
					desc = "User logged in: <b>" + item.user.username + "</b> (" + item.user.full_name + ")";
				break;
				
				// servers
				case 'server_add':
					desc = 'New server added to ' + item.group.title + ': <b>' + app.formatHostname(item.hostname) + '</b> (' + item.ip + ')';
				break;
				
				// state
				case 'state_update':
					if (item.alert_snooze) desc = "Alerts have been snoozed until <b>" + get_nice_date_time(item.alert_snooze, false, false) + "</b>";
					else if (item.alert_snooze === 0) desc = "Alerts have been reactivated.";
					else desc = "State data was updated.";
				break;
				
				// watch
				case 'watch_set':
					if (item.hostname) item.hostnames = [item.hostname];
					var nice_host = app.formatHostname(item.hostnames[0]);
					if (item.hostnames.length > 1) {
						var remain = item.hostnames.length - 1;
						nice_host += " and " + remain + " " + pluralize("other", remain);
					}
					if (item.date) desc = "Server watch set on " + nice_host + " until: <b>" + get_nice_date_time(item.date, false, false) + "</b>";
					else desc = "Server watch canceled for: " + nice_host;
				break;
				
				// errors
				case 'error':
					desc = encode_entities( item.description );
					color = 'red';
				break;
				
				// warnings
				case 'warning':
					desc = encode_entities( item.description );
					color = 'yellow';
				break;
				
			} // action
			
			var tds = [
				'<div style="white-space:nowrap;">' + get_nice_date_time( item.epoch || 0, false, true ) + '</div>',
				'<div class="td_big" style="white-space:nowrap; font-size:12px; font-weight:normal;">' + item_type + '</div>',
				'<div class="activity_desc">' + desc + '</div>',
				'<div style="white-space:nowrap;">' + self.getNiceUsername(item, true) + '</div>',
				(item.ip || 'n/a').replace(/^\:\:ffff\:(\d+\.\d+\.\d+\.\d+)$/, '$1'),
				'<div style="white-space:nowrap;">' + actions.join(' | ') + '</div>'
			];
			if (color) tds.className = color;
			
			return tds;
		} );
		
		html += '</div>'; // padding
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	}
	
});