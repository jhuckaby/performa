// Admin Page -- Group Config

Class.add( Page.Admin, {
	
	gosub_groups: function(args) {
		// show group list
		app.setWindowTitle( "Groups" );
		this.div.addClass('loading');
		app.api.post( 'app/get_groups', copy_object(args), this.receive_groups.bind(this) );
	},
	
	receive_groups: function(resp) {
		// receive all groups from server, render them sorted
		var html = '';
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) + 200) / 6 );
		
		if (!resp.rows) resp.rows = [];
		
		// update local cache, just in case
		config.groups = resp.rows;
		
		// sort by custom sort order
		this.groups = resp.rows.sort( function(a, b) {
			return (a.sort_order < b.sort_order) ? -1 : 1;
		} );
		
		html += this.getSidebarTabs( 'groups',
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
		
		var cols = ['<i class="mdi mdi-menu"></i>', 'Group Title', 'Group ID', 'Hostname Pattern', 'Author', 'Created', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Groups';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var self = this;
		html += this.getBasicTable( this.groups, cols, 'group', function(item, idx) {
			var actions = [];
			// if (idx > 0) actions.push('<span class="link" onMouseUp="$P().group_move_up('+idx+')" title="Move Up"><i class="fa fa-arrow-up"></i></span>');
			// if (idx < self.groups.length - 1) actions.push('<span class="link" onMouseUp="$P().group_move_down('+idx+')" title="Move Down"><i class="fa fa-arrow-down"></i></span>');
			actions.push( '<span class="link" onMouseUp="$P().edit_group('+idx+')"><b>Edit</b></span>' );
			actions.push( '<span class="link" onMouseUp="$P().delete_group('+idx+')"><b>Delete</b></span>' );
			
			var nice_match = '';
			if (item.hostname_match == '(?!)') nice_match = '(None)';
			else nice_match = '<span style="font-family:monospace">/' + item.hostname_match + '/</span>';
			
			return [
				'<div class="td_drag_handle" draggable="true" title="Drag to reorder"><i class="mdi mdi-menu"></i></div>',
				'<div class="td_big">' + self.getNiceGroup(item, true, col_width) + '</div>',
				'<div style="">' + item.id + '</div>',
				'<div class="ellip" style="max-width:'+col_width+'px;">' + nice_match + '</div>',
				self.getNiceUsername(item.username, true, col_width),
				'<span title="'+get_nice_date_time(item.created, true)+'">'+get_nice_date(item.created, true)+'</span>',
				actions.join(' | ')
			];
		} );
		
		html += '<div style="height:30px;"></div>';
		html += '<center><table><tr>';
			html += '<td><div class="button" style="width:130px;" onMouseUp="$P().edit_group(-1)"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Group...</div></td>';
		html += '</tr></table></center>';
		
		html += '</div>'; // padding
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
		
		this.setupDraggableTable({
			table_sel: this.div.find('table.data_table'), 
			handle_sel: 'td div.td_drag_handle', 
			drag_ghost_sel: 'td div.td_big', 
			drag_ghost_x: 5, 
			drag_ghost_y: 10, 
			callback: this.group_move.bind(this)
		});
	},
	
	group_move: function($rows) {
		// a drag operation has been completed
		var items = [];
		
		$rows.each( function(idx) {
			var $row = $(this);
			items.push({
				id: $row.data('id'),
				sort_order: idx
			});
		});
		
		var data = {
			items: items
		};
		app.api.post( 'app/multi_update_group', data, function(resp) {
			// done
		} );
	},
	
	edit_group: function(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Admin?sub=edit_group&id=' + this.groups[idx].id );
		else Nav.go( '#Admin?sub=new_group' );
	},
	
	delete_group: function(idx) {
		// delete group from search results
		this.group = this.groups[idx];
		this.show_delete_group_dialog();
	},
	
	gosub_new_group: function(args) {
		// create new group
		var html = '';
		app.setWindowTitle( "New Group" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'new_group',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['new_group', "New Group"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">New Group</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center><table style="margin:0;">';
		
		this.group = {
			id: "",
			title: "",
			hostname_match: "",
			alerts_enabled: true
		};
		
		html += this.get_group_edit_html();
		
		// buttons at bottom
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:120px; font-weight:normal;" onMouseUp="$P().cancel_group_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				
				html += '<td><div class="button" style="width:120px;" onMouseUp="$P().do_new_group()"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Group</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table></center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
		
		setTimeout( function() {
			$('#fe_eg_id').focus();
		}, 1 );
	},
	
	cancel_group_edit: function() {
		// cancel editing group and return to list
		Nav.go( 'Admin?sub=groups' );
	},
	
	do_new_group: function(force) {
		// create new group
		app.clearError();
		var group = this.get_group_form_json();
		if (!group) return; // error
		
		this.group = group;
		
		app.showProgress( 1.0, "Creating Group..." );
		app.api.post( 'app/create_group', group, this.new_group_finish.bind(this) );
	},
	
	new_group_finish: function(resp) {
		// new group created successfully
		app.hideProgress();
		
		// update client cache
		config.groups.push( copy_object(this.group) );
		
		// update menus
		app.initJumpMenus();
		app.initControlMenus();
		
		// Nav.go('Admin?sub=edit_group&id=' + this.group.id);
		Nav.go('Admin?sub=groups');
		
		setTimeout( function() {
			app.showMessage('success', "The new group was created successfully.");
		}, 150 );
	},
	
	gosub_edit_group: function(args) {
		// edit group subpage
		this.div.addClass('loading');
		app.api.post( 'app/get_group', { id: args.id }, this.receive_group.bind(this) );
	},
	
	receive_group: function(resp) {
		// edit existing group
		var html = '';
		this.group = resp.group;
		
		app.setWindowTitle( "Editing Group \"" + (this.group.title) + "\"" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'edit_group',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['edit_group', "Edit Group"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">Editing Group &ldquo;' + (this.group.title) + '&rdquo;</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center>';
		html += '<table style="margin:0;">';
		
		html += this.get_group_edit_html();
		
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().cancel_group_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().show_delete_group_dialog()">Delete Group...</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px;" onMouseUp="$P().do_save_group()"><i class="fa fa-floppy-o">&nbsp;&nbsp;</i>Save Changes</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table>';
		html += '</center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	do_save_group: function() {
		// save changes to group
		app.clearError();
		var group = this.get_group_form_json();
		if (!group) return; // error
		
		this.group = group;
		
		app.showProgress( 1.0, "Saving Group..." );
		app.api.post( 'app/update_group', group, this.save_group_finish.bind(this) );
	},
	
	save_group_finish: function(resp, tx) {
		// new group saved successfully
		app.hideProgress();
		app.showMessage('success', "The group was saved successfully.");
		window.scrollTo( 0, 0 );
		
		// update client cache
		var group_idx = find_object_idx( config.groups, { id: this.group.id } );
		if (group_idx > -1) {
			config.groups[group_idx] = copy_object(this.group);
		}
		else {
			config.groups.push( copy_object(this.group) );
		}
		
		// update menus
		app.initJumpMenus();
		app.initControlMenus();
	},
	
	show_delete_group_dialog: function() {
		// show dialog confirming group delete action
		var self = this;
		if (config.groups.length < 2) return app.doError("Sorry, you cannot delete the last group.");
		
		app.confirm( '<span style="color:red">Delete Group</span>', "Are you sure you want to <b>permanently delete</b> the group \""+this.group.title+"\"?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				app.showProgress( 1.0, "Deleting Group..." );
				app.api.post( 'app/delete_group', self.group, self.delete_group_finish.bind(self) );
			}
		} );
	},
	
	delete_group_finish: function(resp, tx) {
		// finished deleting group
		var self = this;
		app.hideProgress();
		
		// update client cache
		var group_idx = find_object_idx( config.groups, { id: this.group.id } );
		if (group_idx > -1) {
			config.groups.splice( group_idx, 1 );
		}
		
		// update menus
		app.initJumpMenus();
		app.initControlMenus();
		
		Nav.go('Admin?sub=groups', 'force');
		
		setTimeout( function() {
			app.showMessage('success', "The group '"+self.group.title+"' was deleted successfully.");
		}, 150 );
	},
	
	get_group_edit_html: function() {
		// get html for editing an group (or creating a new one)
		var html = '';
		var group = this.group;
		
		// id
		html += get_form_table_row( 'Group ID', '<input type="text" id="fe_eg_id" size="20" value="'+escape_text_field_value(group.id)+'" spellcheck="false" ' + (group.id ? 'disabled="disabled"' : '') + '/>' );
		html += get_form_table_caption( "Enter a unique ID for the group (alphanumerics only).  Once created this cannot be changed.");
		html += get_form_table_spacer();
		
		// title
		html += get_form_table_row( 'Group Title', '<input type="text" id="fe_eg_title" size="30" value="'+escape_text_field_value(group.title)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Enter the title of the group, for display purposes.");
		html += get_form_table_spacer();
		
		// hostname_match
		html += get_form_table_row( 'Hostname Match', '<input type="text" id="fe_eg_match" size="40" class="mono" value="'+escape_text_field_value((group.hostname_match == '(?!)') ? "" : group.hostname_match)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Optionally enter a regular expression match to auto-include hostnames in the group.<br/>To match <b>all servers</b>, set this to <code>.+</code>");
		html += get_form_table_spacer();
		
		// alert notifications enabled
		html += get_form_table_row( 'Alerts', '<input type="checkbox" id="fe_eg_alerts" value="1" ' + (group.alerts_enabled ? 'checked="checked"' : '') + '/><label for="fe_eg_alerts">Alert Notifications Enabled</label>' );
		html += get_form_table_caption( "You can enable or disable alert notifications for the entire group here." );
		html += get_form_table_spacer();
		
		// default email
		html += get_form_table_row( 'Alert Email', '<input type="text" id="fe_eg_alert_email" size="50" value="'+escape_text_field_value(group.alert_email)+'" spellcheck="false" placeholder="email@sample.com" spellcheck="false" onChange="$P().update_add_remove_me($(this))"/><span class="link addme" onMouseUp="$P().add_remove_me($(this).prev())"></span>' );
		html += get_form_table_caption( "Optionally set the default e-mail recipients to be notified for alerts in this group.<br/>Note that individual alerts can override this setting.");
		html += get_form_table_spacer();
		
		// default web hook
		html += get_form_table_row( 'Alert Web Hook', '<input type="text" id="fe_eg_alert_web_hook" size="50" value="'+escape_text_field_value(group.alert_web_hook)+'" spellcheck="false" placeholder="https://"/>' );
		html += get_form_table_caption( "Optionally set the default web hook URL for alerts in this group.<br/>Note that individual alerts can override this setting.");
		html += get_form_table_spacer();
		
		// notes
		html += get_form_table_row( 'Notes', '<textarea id="fe_eg_notes" style="width:500px; height:50px; resize:vertical;">'+escape_text_field_value(group.notes)+'</textarea>' );
		html += get_form_table_caption( "Optionally enter any notes for the group, for your own use." );
		html += get_form_table_spacer();
		
		return html;
	},
	
	get_group_form_json: function() {
		// get api key elements from form, used for new or edit
		var group = this.group;
		
		group.id = $('#fe_eg_id').val().replace(/\W+/g, '').toLowerCase();
		group.title = $('#fe_eg_title').val();
		group.hostname_match = $('#fe_eg_match').val();
		group.alerts_enabled = $('#fe_eg_alerts').is(':checked') ? true : false;
		group.alert_email = $('#fe_eg_alert_email').val();
		group.alert_web_hook = $('#fe_eg_alert_web_hook').val();
		group.notes = $('#fe_eg_notes').val();
		
		if (!group.id.length) {
			return app.badField('#fe_eg_id', "Please enter a unique alphanumeric ID for the group.");
		}
		if (!group.title.length) {
			return app.badField('#fe_eg_title', "Please enter a title for the group.");
		}
		if (!group.hostname_match) {
			// default to never-match regexp
			group.hostname_match = '(?!)';
		}
		
		// test regexp, as it was entered by a user
		try { new RegExp(group.hostname_match); }
		catch(err) {
			return app.badField('fe_eg_match', "Invalid regular expression: " + err);
		}
		
		return group;
	}
	
});
