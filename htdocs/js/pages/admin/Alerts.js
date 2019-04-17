// Admin Page -- Alert Config

Class.add( Page.Admin, {
	
	gosub_alerts: function(args) {
		// show alert list
		app.setWindowTitle( "Alerts" );
		this.div.addClass('loading');
		app.api.post( 'app/get_alerts', copy_object(args), this.receive_alerts.bind(this) );
	},
	
	receive_alerts: function(resp) {
		// receive all alerts from server, render them sorted
		var html = '';
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) + 200) / 6 );
		
		if (!resp.rows) resp.rows = [];
		
		// update local cache, just in case
		config.alerts = resp.rows;
		
		// sort by title ascending
		this.alerts = resp.rows.sort( function(a, b) {
			return a.title.toLowerCase().localeCompare( b.title.toLowerCase() );
		} );
		
		html += this.getSidebarTabs( 'alerts',
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
		
		var cols = ['<i class="fa fa-check-square-o"></i>', 'Alert Title', 'Alert ID', 'Groups', 'Author', 'Created', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Alerts';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var self = this;
		html += this.getBasicTable( this.alerts, cols, 'alert', function(item, idx) {
			var actions = [
				'<span class="link" onMouseUp="$P().edit_alert('+idx+')"><b>Edit</b></span>',
				'<span class="link" onMouseUp="$P().delete_alert('+idx+')"><b>Delete</b></span>'
			];
			var tds = [
				'<input type="checkbox" style="cursor:pointer" onChange="$P().change_alert_enabled('+idx+')" '+(item.enabled ? 'checked="checked"' : '')+'/>', 
				'<div class="td_big">' + self.getNiceAlert(item, true, col_width) + '</div>',
				'<code>' + item.id + '</code>',
				self.getNiceGroupList(item.group_match, true, col_width),
				self.getNiceUsername(item.username, true, col_width),
				'<span title="'+get_nice_date_time(item.created, true)+'">'+get_nice_date(item.created, true)+'</span>',
				actions.join(' | ')
			];
			
			if (!item.enabled) {
				if (tds.className) tds.className += ' '; else tds.className = '';
				tds.className += 'disabled';
			}
			
			return tds;
		} );
		
		html += '<div style="height:30px;"></div>';
		html += '<center><table><tr>';
			html += '<td><div class="button" style="width:130px;" onMouseUp="$P().edit_alert(-1)"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Alert...</div></td>';
		html += '</tr></table></center>';
		
		html += '</div>'; // padding
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	change_alert_enabled: function(idx) {
		// toggle alert on / off
		var self = this;
		var alert = this.alerts[idx];
		alert.enabled = alert.enabled ? false : true;
		
		var stub = {
			id: alert.id,
			enabled: alert.enabled,
		};
		
		app.api.post( 'app/update_alert', stub, function(resp) {
			self.receive_alerts({ rows: self.alerts });
		} );
	},
	
	edit_alert: function(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Admin?sub=edit_alert&id=' + this.alerts[idx].id );
		else Nav.go( '#Admin?sub=new_alert' );
	},
	
	delete_alert: function(idx) {
		// delete alert from search results
		this.alert = this.alerts[idx];
		this.show_delete_alert_dialog();
	},
	
	gosub_new_alert: function(args) {
		// create new alert
		var html = '';
		app.setWindowTitle( "New Alert" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'new_alert',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['new_alert', "New Alert"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">New Alert</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center><table style="margin:0;">';
		
		this.alert = {
			"id": "",
			"title": "",
			"expression": "",
			"message": "",
			"group_match": ".+",
			"email": "",
			"web_hook": "",
			"enabled": true
		};
		
		html += this.get_alert_edit_html();
		
		// buttons at bottom
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:120px; font-weight:normal;" onMouseUp="$P().cancel_alert_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				
				html += '<td><div class="button" style="width:120px;" onMouseUp="$P().do_new_alert()"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Alert</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table></center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
		
		setTimeout( function() {
			$('#fe_ea_id').focus();
		}, 1 );
	},
	
	cancel_alert_edit: function() {
		// cancel editing alert and return to list
		Nav.go( 'Admin?sub=alerts' );
	},
	
	do_new_alert: function(force) {
		// create new alert
		app.clearError();
		var alert = this.get_alert_form_json();
		if (!alert) return; // error
		
		this.alert = alert;
		
		app.showProgress( 1.0, "Creating Alert..." );
		app.api.post( 'app/create_alert', alert, this.new_alert_finish.bind(this) );
	},
	
	new_alert_finish: function(resp) {
		// new alert created successfully
		app.hideProgress();
		
		// update client cache
		config.alerts.push( copy_object(this.alert) );
		
		// Nav.go('Admin?sub=edit_alert&id=' + this.alert.id);
		Nav.go('Admin?sub=alerts');
		
		setTimeout( function() {
			app.showMessage('success', "The new alert was created successfully.");
		}, 150 );
	},
	
	gosub_edit_alert: function(args) {
		// edit alert subpage
		this.div.addClass('loading');
		app.api.post( 'app/get_alert', { id: args.id }, this.receive_alert.bind(this) );
	},
	
	receive_alert: function(resp) {
		// edit existing alert
		var html = '';
		this.alert = resp.alert;
		
		app.setWindowTitle( "Editing Alert \"" + (this.alert.title) + "\"" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'edit_alert',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['edit_alert', "Edit Alert"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">Editing Alert &ldquo;' + (this.alert.title) + '&rdquo;</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center>';
		html += '<table style="margin:0;">';
		
		html += this.get_alert_edit_html();
		
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().cancel_alert_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().show_delete_alert_dialog()">Delete Alert...</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px;" onMouseUp="$P().do_save_alert()"><i class="fa fa-floppy-o">&nbsp;&nbsp;</i>Save Changes</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table>';
		html += '</center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	do_save_alert: function() {
		// save changes to alert
		app.clearError();
		var alert = this.get_alert_form_json();
		if (!alert) return; // error
		
		this.alert = alert;
		
		app.showProgress( 1.0, "Saving Alert..." );
		app.api.post( 'app/update_alert', alert, this.save_alert_finish.bind(this) );
	},
	
	save_alert_finish: function(resp, tx) {
		// new alert saved successfully
		app.hideProgress();
		app.showMessage('success', "The alert was saved successfully.");
		window.scrollTo( 0, 0 );
		
		// update client cache
		var alert_idx = find_object_idx( config.alerts, { id: this.alert.id } );
		if (alert_idx > -1) {
			config.alerts[alert_idx] = copy_object(this.alert);
		}
		else {
			config.alerts.push( copy_object(this.alert) );
		}
	},
	
	show_delete_alert_dialog: function() {
		// show dialog confirming alert delete action
		var self = this;
		app.confirm( '<span style="color:red">Delete Alert</span>', "Are you sure you want to <b>permanently delete</b> the alert \""+this.alert.title+"\"?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				app.showProgress( 1.0, "Deleting Alert..." );
				app.api.post( 'app/delete_alert', self.alert, self.delete_alert_finish.bind(self) );
			}
		} );
	},
	
	delete_alert_finish: function(resp, tx) {
		// finished deleting alert
		var self = this;
		app.hideProgress();
		
		// update client cache
		var alert_idx = find_object_idx( config.alerts, { id: this.alert.id } );
		if (alert_idx > -1) {
			config.alerts.splice( alert_idx, 1 );
		}
		
		Nav.go('Admin?sub=alerts', 'force');
		
		setTimeout( function() {
			app.showMessage('success', "The alert '"+self.alert.title+"' was deleted successfully.");
		}, 150 );
	},
	
	get_alert_edit_html: function() {
		// get html for editing an alert (or creating a new one)
		var html = '';
		var alert = this.alert;
		
		// id
		html += get_form_table_row( 'Alert ID', '<input type="text" id="fe_ea_id" size="20" value="'+escape_text_field_value(alert.id)+'" spellcheck="false" ' + (alert.id ? 'disabled="disabled"' : '') + '/>' );
		html += get_form_table_caption( "Enter a unique ID for the alert (alphanumerics only).  Once created this cannot be changed.");
		html += get_form_table_spacer();
		
		// title
		html += get_form_table_row( 'Alert Title', '<input type="text" id="fe_ea_title" size="30" value="'+escape_text_field_value(alert.title)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Enter the title of the alert, for display purposes.");
		html += get_form_table_spacer();
		
		// enabled
		html += get_form_table_row( 'Notify', '<input type="checkbox" id="fe_ea_enabled" value="1" ' + (alert.enabled ? 'checked="checked"' : '') + '/><label for="fe_ea_enabled">Notifications Enabled</label>' );
		html += get_form_table_caption( "Check this box to enable e-mail and web hook notifications for the alert." );
		html += get_form_table_spacer();
		
		// group match
		html += get_form_table_row( 'Groups', this.renderGroupSelector('fe_ea', alert.group_match) );
		html += get_form_table_caption( "Select which groups the alert should apply to.");
		html += get_form_table_spacer();
		
		// "expression": "[load_avg] >= ([cpus/length] + 1)",
		html += get_form_table_row( 'Expression', '<textarea id="fe_ea_expression" style="width:550px; height:50px; resize:vertical;">'+escape_text_field_value(alert.expression)+'</textarea>' );
		html += get_form_table_caption( 
			"Enter the expression to evaluate the alert condition, e.g. <code>[monitors/load_avg] >= 5.0</code>.<br/>" + 
			'If you need help, you can use the <span class="link" onMouseUp="$P().showHostDataExplorer(\'#fe_ea_expression\')">Server Data Explorer</span>, or view the <a href="https://github.com/jhuckaby/performa#alert-expressions" target="_blank">documentation</a>.'
		);
		html += get_form_table_spacer();
		
		// "message": "CPU load average is too high: [load_avg] ([cpus/length] CPU cores)",
		html += get_form_table_row( 'Message', '<textarea id="fe_ea_message" style="width:550px; height:50px; resize:vertical;">'+escape_text_field_value(alert.message)+'</textarea>' );
		html += get_form_table_caption( 
			"Enter the message text to be delivered with the alert notifications. " + 
			'You can use <a href="https://github.com/jhuckaby/performa#alert-expressions" target="_blank">alert expressions</a> here.'
		);
		html += get_form_table_spacer();
		
		// optionally attach to monitor for label overlays?
		var monitor_items = [ ['', "(None)"] ].concat(
			config.monitors.sort( function(a, b) {
				return (a.sort_order < b.sort_order) ? -1 : 1;
			} )
		);
		html += get_form_table_row( 'Overlay', '<select id="fe_ea_monitor">' + render_menu_options(monitor_items, alert.monitor_id) + '</select>' );
		html += get_form_table_caption( "Optionally select a monitor to overlay alert annotations on." );
		html += get_form_table_spacer();
		
		// "email": "",
		html += get_form_table_row( 'Email', '<input type="text" id="fe_ea_email" size="50" value="'+escape_text_field_value(alert.email)+'" spellcheck="false" placeholder="email@sample.com" spellcheck="false" onChange="$P().update_add_remove_me($(this))"/><span class="link addme" onMouseUp="$P().add_remove_me($(this).prev())"></span>' );
		html += get_form_table_caption( "Optionally customize the e-mail recipients to be notified for this alert.");
		html += get_form_table_spacer();
		
		// "web_hook": "",
		html += get_form_table_row( 'Web Hook', '<input type="text" id="fe_ea_web_hook" size="50" value="'+escape_text_field_value(alert.web_hook)+'" spellcheck="false" placeholder="https://"/>' );
		html += get_form_table_caption( "Optionally enter a custom Web Hook URL for this alert.");
		html += get_form_table_spacer();
		
		// notes
		html += get_form_table_row( 'Notes', '<textarea id="fe_ea_notes" style="width:550px; height:50px; resize:vertical;">'+escape_text_field_value(alert.notes)+'</textarea>' );
		html += get_form_table_caption( "Optionally enter notes for the alert, which will be included in all e-mail notifications." );
		html += get_form_table_spacer();
		
		setTimeout( function() {
			$P().update_add_remove_me( $('#fe_ea_email') );
		}, 1 );
		
		return html;
	},
	
	get_alert_form_json: function() {
		// get api key elements from form, used for new or edit
		var alert = this.alert;
		
		alert.id = $('#fe_ea_id').val().replace(/\W+/g, '').toLowerCase();
		alert.title = $('#fe_ea_title').val();
		alert.enabled = $('#fe_ea_enabled').is(':checked') ? true : false;
		alert.group_match = this.getGroupSelectorValue('fe_ea');
		alert.expression = $('#fe_ea_expression').val();
		alert.message = $('#fe_ea_message').val();
		alert.email = $('#fe_ea_email').val();
		alert.web_hook = $('#fe_ea_web_hook').val();
		alert.notes = $('#fe_ea_notes').val();
		alert.monitor_id = $('#fe_ea_monitor').val();
		
		if (!alert.id.length) {
			return app.badField('#fe_ea_id', "Please enter a unique alphanumeric ID for the alert.");
		}
		if (!alert.title.length) {
			return app.badField('#fe_ea_title', "Please enter a title for the alert.");
		}
		
		return alert;
	}
	
});
