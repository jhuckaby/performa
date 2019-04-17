// Admin Page -- Command Config

Class.add( Page.Admin, {
	
	gosub_commands: function(args) {
		// show command list
		app.setWindowTitle( "Commands" );
		this.div.addClass('loading');
		app.api.post( 'app/get_commands', copy_object(args), this.receive_commands.bind(this) );
	},
	
	receive_commands: function(resp) {
		// receive all commands from server, render them sorted
		var html = '';
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) + 200) / 6 );
		
		if (!resp.rows) resp.rows = [];
		
		// update local cache, just in case
		config.commands = resp.rows;
		
		// sort by title ascending
		this.commands = resp.rows.sort( function(a, b) {
			return a.title.toLowerCase().localeCompare( b.title.toLowerCase() );
		} );
		
		html += this.getSidebarTabs( 'commands',
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
		
		var cols = ['<i class="fa fa-check-square-o"></i>', 'Command Title', 'Command ID', 'Groups', 'Author', 'Created', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Commands';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var self = this;
		html += this.getBasicTable( this.commands, cols, 'command', function(item, idx) {
			var actions = [
				'<span class="link" onMouseUp="$P().edit_command('+idx+')"><b>Edit</b></span>',
				'<span class="link" onMouseUp="$P().delete_command('+idx+')"><b>Delete</b></span>'
			];
			var tds = [
				'<input type="checkbox" style="cursor:pointer" onChange="$P().change_command_enabled('+idx+')" '+(item.enabled ? 'checked="checked"' : '')+'/>', 
				'<div class="td_big">' + self.getNiceCommand(item, true, col_width) + '</div>',
				'<code>' + item.id + '</code>',
				self.getNiceGroupList(item.group_match, true, col_width),
				self.getNiceUsername(item.username, true, col_width),
				'<span title="'+get_nice_date_time(item.created, true)+'">'+get_nice_date(item.created, true)+'</span>',
				actions.join(' | ')
			];
			
			tds.className = 'checkbox_first_col';
			
			if (!item.enabled) {
				if (tds.className) tds.className += ' '; else tds.className = '';
				tds.className += 'disabled';
			}
			
			return tds;
		} );
		
		html += '<div style="height:30px;"></div>';
		html += '<center><table><tr>';
			html += '<td><div class="button" style="width:130px;" onMouseUp="$P().edit_command(-1)"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Command...</div></td>';
		html += '</tr></table></center>';
		
		html += '</div>'; // padding
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	change_command_enabled: function(idx) {
		// toggle command on / off
		var self = this;
		var command = this.commands[idx];
		command.enabled = command.enabled ? false : true;
		
		var stub = {
			id: command.id,
			enabled: command.enabled,
		};
		
		app.api.post( 'app/update_command', stub, function(resp) {
			self.receive_commands({ rows: self.commands });
		} );
	},
	
	edit_command: function(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Admin?sub=edit_command&id=' + this.commands[idx].id );
		else Nav.go( '#Admin?sub=new_command' );
	},
	
	delete_command: function(idx) {
		// delete command from search results
		this.command = this.commands[idx];
		this.show_delete_command_dialog();
	},
	
	gosub_new_command: function(args) {
		// create new command
		var html = '';
		app.setWindowTitle( "New Command" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'new_command',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['new_command', "New Command"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">New Command</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center><table style="margin:0;">';
		
		this.command = {
			"id": "",
			"title": "",
			"exec": "/bin/sh",
			"script": "",
			"group_match": ".+",
			"enabled": true,
			"format": "text",
			"timeout": 5
		};
		
		html += this.get_command_edit_html();
		
		// buttons at bottom
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:120px; font-weight:normal;" onMouseUp="$P().cancel_command_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				
				html += '<td><div class="button" style="width:120px;" onMouseUp="$P().do_new_command()"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Command</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table></center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
		
		setTimeout( function() {
			$('#fe_ec_id').focus();
		}, 1 );
	},
	
	cancel_command_edit: function() {
		// cancel editing command and return to list
		Nav.go( 'Admin?sub=commands' );
	},
	
	do_new_command: function(force) {
		// create new command
		app.clearError();
		var command = this.get_command_form_json();
		if (!command) return; // error
		
		this.command = command;
		
		app.showProgress( 1.0, "Creating Command..." );
		app.api.post( 'app/create_command', command, this.new_command_finish.bind(this) );
	},
	
	new_command_finish: function(resp) {
		// new command created successfully
		app.hideProgress();
		
		// update client cache
		config.commands.push( copy_object(this.command) );
		
		// Nav.go('Admin?sub=edit_command&id=' + this.command.id);
		Nav.go('Admin?sub=commands');
		
		setTimeout( function() {
			app.showMessage('success', "The new command was created successfully.");
		}, 150 );
	},
	
	gosub_edit_command: function(args) {
		// edit command subpage
		this.div.addClass('loading');
		app.api.post( 'app/get_command', { id: args.id }, this.receive_command.bind(this) );
	},
	
	receive_command: function(resp) {
		// edit existing command
		var html = '';
		this.command = resp.command;
		
		app.setWindowTitle( "Editing Command \"" + (this.command.title) + "\"" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'edit_command',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['edit_command', "Edit Command"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">Editing Command &ldquo;' + (this.command.title) + '&rdquo;</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center>';
		html += '<table style="margin:0;">';
		
		html += this.get_command_edit_html();
		
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().cancel_command_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().show_delete_command_dialog()">Delete Command...</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px;" onMouseUp="$P().do_save_command()"><i class="fa fa-floppy-o">&nbsp;&nbsp;</i>Save Changes</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table>';
		html += '</center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	do_save_command: function() {
		// save changes to command
		app.clearError();
		var command = this.get_command_form_json();
		if (!command) return; // error
		
		this.command = command;
		
		app.showProgress( 1.0, "Saving Command..." );
		app.api.post( 'app/update_command', command, this.save_command_finish.bind(this) );
	},
	
	save_command_finish: function(resp, tx) {
		// new command saved successfully
		app.hideProgress();
		app.showMessage('success', "The command was saved successfully.");
		window.scrollTo( 0, 0 );
		
		// update client cache
		var command_idx = find_object_idx( config.commands, { id: this.command.id } );
		if (command_idx > -1) {
			config.commands[command_idx] = copy_object(this.command);
		}
		else {
			config.commands.push( copy_object(this.command) );
		}
	},
	
	show_delete_command_dialog: function() {
		// show dialog confirming command delete action
		var self = this;
		app.confirm( '<span style="color:red">Delete Command</span>', "Are you sure you want to <b>permanently delete</b> the command \""+this.command.title+"\"?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				app.showProgress( 1.0, "Deleting Command..." );
				app.api.post( 'app/delete_command', self.command, self.delete_command_finish.bind(self) );
			}
		} );
	},
	
	delete_command_finish: function(resp, tx) {
		// finished deleting command
		var self = this;
		app.hideProgress();
		
		// update client cache
		var command_idx = find_object_idx( config.commands, { id: this.command.id } );
		if (command_idx > -1) {
			config.commands.splice( command_idx, 1 );
		}
		
		Nav.go('Admin?sub=commands', 'force');
		
		setTimeout( function() {
			app.showMessage('success', "The command '"+self.command.title+"' was deleted successfully.");
		}, 150 );
	},
	
	get_command_edit_html: function() {
		// get html for editing an command (or creating a new one)
		var html = '';
		var command = this.command;
		
		// id
		html += get_form_table_row( 'Command ID', '<input type="text" id="fe_ec_id" size="20" value="'+escape_text_field_value(command.id)+'" spellcheck="false" ' + (command.id ? 'disabled="disabled"' : '') + '/>' );
		html += get_form_table_caption( "Enter a unique ID for the command (alphanumerics only).  Once created this cannot be changed.");
		html += get_form_table_spacer();
		
		// title
		html += get_form_table_row( 'Command Title', '<input type="text" id="fe_ec_title" size="30" value="'+escape_text_field_value(command.title)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Enter the title of the command, for display purposes.");
		html += get_form_table_spacer();
		
		// enabled
		html += get_form_table_row( 'Active', '<input type="checkbox" id="fe_ec_enabled" value="1" ' + (command.enabled ? 'checked="checked"' : '') + '/><label for="fe_ec_enabled">Command Enabled</label>' );
		html += get_form_table_caption( "Only enabled commands will be executed on matching servers." );
		html += get_form_table_spacer();
		
		// group match
		html += get_form_table_row( 'Groups', this.renderGroupSelector('fe_ec', command.group_match) );
		html += get_form_table_caption( "Select which groups the command should apply to.");
		html += get_form_table_spacer();
		
		// exec
		html += get_form_table_row( 'Shell', '<input type="text" id="fe_ec_exec" size="40" class="mono" value="'+escape_text_field_value(command.exec)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Enter the shell interpreter path to process your command script.<br/>This can also be a non-shell interpreter such as <b>/usr/bin/perl</b> or <b>/usr/bin/python</b>.");
		html += get_form_table_spacer();
		
		// script
		html += get_form_table_row( 'Script', '<textarea id="fe_ec_script" style="width:600px; height:80px; resize:vertical;">'+escape_text_field_value(command.script)+'</textarea>' );
		html += get_form_table_caption( "Enter the script source to be executed using the selected interpreter." );
		html += get_form_table_spacer();
		
		// format
		html += get_form_table_row( 'Format', '<select id="fe_ec_format">' + render_menu_options([['text', "Text"], ['json', "JSON"], ['xml', "XML"]], command.format) + '</select>' );
		html += get_form_table_caption( "Select the output format that the script generates, so it can be parsed correctly." );
		html += get_form_table_spacer();
		
		// timeout
		html += get_form_table_row( 'Timeout', '<input type="text" id="fe_ec_timeout" size="5" value="'+escape_text_field_value(command.timeout)+'" spellcheck="false"/><span style="font-size:11px">&nbsp;(seconds)</span>' );
		html += get_form_table_caption( "Enter the maximum time to allow the command to run, in seconds.");
		html += get_form_table_spacer();
		
		// uid
		html += get_form_table_row( 'User ID', '<input type="text" id="fe_ec_uid" size="20" value="'+escape_text_field_value(command.uid)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Optionally enter a custom User ID to run the command as.<br/>The UID may be either numerical or a username string ('root', 'wheel', etc.).");
		html += get_form_table_spacer();
		
		// notes
		html += get_form_table_row( 'Notes', '<textarea id="fe_ec_notes" style="width:500px; height:50px; resize:vertical;">'+escape_text_field_value(command.notes)+'</textarea>' );
		html += get_form_table_caption( "Optionally enter any notes for the command, for your own use." );
		html += get_form_table_spacer();
		
		return html;
	},
	
	get_command_form_json: function() {
		// get api key elements from form, used for new or edit
		var command = this.command;
		
		command.id = $('#fe_ec_id').val().replace(/\W+/g, '').toLowerCase();
		command.title = $('#fe_ec_title').val();
		command.enabled = $('#fe_ec_enabled').is(':checked') ? true : false;
		command.group_match = this.getGroupSelectorValue('fe_ec');
		command.exec = $('#fe_ec_exec').val();
		command.script = $('#fe_ec_script').val();
		command.format = $('#fe_ec_format').val();
		command.timeout = parseInt( $('#fe_ec_timeout').val() ) || 0;
		command.uid = $('#fe_ec_uid').val();
		command.notes = $('#fe_ec_notes').val();
		
		if (!command.id.length) {
			return app.badField('#fe_ec_id', "Please enter a unique alphanumeric ID for the command.");
		}
		if (!command.title.length) {
			return app.badField('#fe_ec_title', "Please enter a title for the command.");
		}
		if (!command.exec.length) {
			return app.badField('#fe_ec_exec', "Please enter a shell interpreter path.");
		}
		if (!command.script.length) {
			return app.badField('#fe_ec_script', "Please enter the script source to be executed.");
		}
		if (!command.timeout || (command.timeout < 0)) {
			return app.badField('#fe_ec_timeout', "Please enter a number of seconds for the command timeout.");
		}
		
		return command;
	}
	
});
