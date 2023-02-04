// Admin Page -- Monitor Config

Class.add( Page.Admin, {
	
	gosub_monitors: function(args) {
		// show monitor list
		app.setWindowTitle( "Monitors" );
		this.div.addClass('loading');
		app.api.post( 'app/get_monitors', copy_object(args), this.receive_monitors.bind(this) );
	},
	
	receive_monitors: function(resp) {
		// receive all monitors from server, render them sorted
		var self = this;
		var html = '';
		this.div.removeClass('loading');
		
		var size = get_inner_window_size();
		var col_width = Math.floor( ((size.width * 0.9) + 200) / 6 );
		
		if (!resp.rows) resp.rows = [];
		
		// update local cache, just in case
		config.monitors = resp.rows;
		
		// sort by custom sort order
		this.monitors = resp.rows.sort( function(a, b) {
			return (a.sort_order < b.sort_order) ? -1 : 1;
		} );
		
		html += this.getSidebarTabs( 'monitors',
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
		
		var cols = ['<i class="mdi mdi-menu"></i>', 'Monitor Title', 'Monitor ID', 'Groups', 'Author', 'Created', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Monitors';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		var self = this;
		html += this.getBasicTable( this.monitors, cols, 'monitor', function(item, idx) {
			var actions = [];
			// if (idx > 0) actions.push('<span class="link" onMouseUp="$P().move_up('+idx+')" title="Move Up"><i class="fa fa-arrow-up"></i></span>');
			// if (idx < self.monitors.length - 1) actions.push('<span class="link" onMouseUp="$P().move_down('+idx+')" title="Move Down"><i class="fa fa-arrow-down"></i></span>');
			actions.push('<span class="link" onMouseUp="$P().edit_monitor('+idx+')"><b>Edit</b></span>');
			actions.push('<span class="link" onMouseUp="$P().delete_monitor('+idx+')"><b>Delete</b></span>');
			
			var tds = [
				'<div class="td_drag_handle" draggable="true" title="Drag to reorder"><i class="mdi mdi-menu"></i></div>',
				// '<input type="checkbox" style="cursor:pointer" onChange="$P().change_monitor_display('+idx+')" '+(item.display ? 'checked="checked"' : '')+'/>', 
				'<div class="td_big">' + self.getNiceMonitor(item, true, col_width) + '</div>',
				'<code>' + item.id + '</code>',
				self.getNiceGroupList(item.group_match, true, col_width),
				self.getNiceUsername(item.username, true, col_width),
				'<span title="'+get_nice_date_time(item.created, true)+'">'+get_nice_date(item.created, true)+'</span>',
				actions.join(' | ')
			];
			
			tds.className = 'checkbox_first_col';
			
			if (!item.display) {
				if (tds.className) tds.className += ' '; else tds.className = '';
				tds.className += 'disabled';
			}
			
			return tds;
		} );
		
		html += '<div style="height:30px;"></div>';
		html += '<center><table><tr>';
			html += '<td><div class="button" style="width:130px;" onMouseUp="$P().edit_monitor(-1)"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Monitor...</div></td>';
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
			callback: this.monitor_move.bind(this)
		});
	},
	
	change_monitor_display: function(idx) {
		// toggle monitor display on / off
		var self = this;
		var monitor = this.monitors[idx];
		monitor.display = monitor.display ? false : true;
		
		var stub = {
			id: monitor.id,
			display: monitor.display,
		};
		
		app.api.post( 'app/update_monitor', stub, function(resp) {
			self.receive_monitors({ rows: self.monitors });
		} );
	},
	
	monitor_move: function($rows) {
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
		app.api.post( 'app/multi_update_monitor', data, function(resp) {
			// done
		} );
	},
	
	edit_monitor: function(idx) {
		// jump to edit sub
		if (idx > -1) Nav.go( '#Admin?sub=edit_monitor&id=' + this.monitors[idx].id );
		else Nav.go( '#Admin?sub=new_monitor' );
	},
	
	delete_monitor: function(idx) {
		// delete monitor from search results
		this.monitor = this.monitors[idx];
		this.show_delete_monitor_dialog();
	},
	
	gosub_new_monitor: function(args) {
		// create new monitor
		var html = '';
		app.setWindowTitle( "New Monitor" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'new_monitor',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['new_monitor', "New Monitor"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">New Monitor</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center><table style="margin:0;">';
		
		this.monitor = {
			"id": "",
			"title": "",
			"source": "",
			"data_type": "float",
			"suffix": "",
			"merge_type": "",
			"group_match": ".+",
			"display": true
		};
		
		html += this.get_monitor_edit_html();
		
		// buttons at bottom
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:120px; font-weight:normal;" onMouseUp="$P().cancel_monitor_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				
				html += '<td><div class="button" style="width:120px;" onMouseUp="$P().do_new_monitor()"><i class="fa fa-plus-circle">&nbsp;&nbsp;</i>Add Monitor</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table></center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
		
		setTimeout( function() {
			$('#fe_em_id').focus();
		}, 1 );
	},
	
	cancel_monitor_edit: function() {
		// cancel editing monitor and return to list
		Nav.go( 'Admin?sub=monitors' );
	},
	
	do_new_monitor: function(force) {
		// create new monitor
		app.clearError();
		var monitor = this.get_monitor_form_json();
		if (!monitor) return; // error
		
		this.monitor = monitor;
		
		app.showProgress( 1.0, "Creating Monitor..." );
		app.api.post( 'app/create_monitor', monitor, this.new_monitor_finish.bind(this) );
	},
	
	new_monitor_finish: function(resp) {
		// new monitor created successfully
		app.hideProgress();
		
		// update client cache
		config.monitors.push( copy_object(this.monitor) );
		
		// Nav.go('Admin?sub=edit_monitor&id=' + this.monitor.id);
		Nav.go('Admin?sub=monitors');
		
		setTimeout( function() {
			app.showMessage('success', "The new monitor was created successfully.");
		}, 150 );
	},
	
	gosub_edit_monitor: function(args) {
		// edit monitor subpage
		this.div.addClass('loading');
		app.api.post( 'app/get_monitor', { id: args.id }, this.receive_monitor.bind(this) );
	},
	
	receive_monitor: function(resp) {
		// edit existing monitor
		var html = '';
		this.monitor = resp.monitor;
		
		app.setWindowTitle( "Editing Monitor \"" + (this.monitor.title) + "\"" );
		this.div.removeClass('loading');
		
		html += this.getSidebarTabs( 'edit_monitor',
			[
				['activity', "Activity"],
				['alerts', "Alerts"],
				['api_keys', "API Keys"],
				['commands', "Commands"],
				['groups', "Groups"],
				['monitors', "Monitors"],
				['edit_monitor', "Edit Monitor"],
				['users', "Users"]
			]
		);
		
		html += '<div style="padding:20px;"><div class="subtitle">Editing Monitor &ldquo;' + (this.monitor.title) + '&rdquo;</div></div>';
		
		html += '<div style="padding:0px 20px 50px 20px">';
		html += '<center>';
		html += '<table style="margin:0;">';
		
		html += this.get_monitor_edit_html();
		
		html += '<tr><td colspan="2" align="center">';
			html += '<div style="height:30px;"></div>';
			
			html += '<table><tr>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().cancel_monitor_edit()">Cancel</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px; font-weight:normal;" onMouseUp="$P().show_delete_monitor_dialog()">Delete Monitor...</div></td>';
				html += '<td width="50">&nbsp;</td>';
				html += '<td><div class="button" style="width:130px;" onMouseUp="$P().do_save_monitor()"><i class="fa fa-floppy-o">&nbsp;&nbsp;</i>Save Changes</div></td>';
			html += '</tr></table>';
			
		html += '</td></tr>';
		
		html += '</table>';
		html += '</center>';
		html += '</div>'; // table wrapper div
		
		html += '</div>'; // sidebar tabs
		
		this.div.html( html );
	},
	
	do_save_monitor: function() {
		// save changes to monitor
		app.clearError();
		var monitor = this.get_monitor_form_json();
		if (!monitor) return; // error
		
		this.monitor = monitor;
		
		app.showProgress( 1.0, "Saving Monitor..." );
		app.api.post( 'app/update_monitor', monitor, this.save_monitor_finish.bind(this) );
	},
	
	save_monitor_finish: function(resp, tx) {
		// new monitor saved successfully
		app.hideProgress();
		app.showMessage('success', "The monitor was saved successfully.");
		window.scrollTo( 0, 0 );
		
		// update client cache
		var mon_idx = find_object_idx( config.monitors, { id: this.monitor.id } );
		if (mon_idx > -1) {
			config.monitors[mon_idx] = copy_object(this.monitor);
		}
		else {
			config.monitors.push( copy_object(this.monitor) );
		}
	},
	
	show_delete_monitor_dialog: function() {
		// show dialog confirming monitor delete action
		var self = this;
		if (config.monitors.length < 2) return app.doError("Sorry, you cannot delete the last monitor.");
		
		app.confirm( '<span style="color:red">Delete Monitor</span>', "Are you sure you want to <b>permanently delete</b> the monitor \""+this.monitor.title+"\"?  There is no way to undo this action.", 'Delete', function(result) {
			if (result) {
				app.showProgress( 1.0, "Deleting Monitor..." );
				app.api.post( 'app/delete_monitor', self.monitor, self.delete_monitor_finish.bind(self) );
			}
		} );
	},
	
	delete_monitor_finish: function(resp, tx) {
		// finished deleting monitor
		var self = this;
		app.hideProgress();
		
		// update client cache
		var mon_idx = find_object_idx( config.monitors, { id: this.monitor.id } );
		if (mon_idx > -1) {
			config.monitors.splice( mon_idx, 1 );
		}
		
		Nav.go('Admin?sub=monitors', 'force');
		
		setTimeout( function() {
			app.showMessage('success', "The monitor '"+self.monitor.title+"' was deleted successfully.");
		}, 150 );
	},
	
	get_monitor_edit_html: function() {
		// get html for editing an monitor (or creating a new one)
		var html = '';
		var monitor = this.monitor;
		
		// id
		html += get_form_table_row( 'Monitor ID', '<input type="text" id="fe_em_id" size="20" value="'+escape_text_field_value(monitor.id)+'" spellcheck="false" ' + (monitor.id ? 'disabled="disabled"' : '') + '/>' );
		html += get_form_table_caption( "Enter a unique ID for the monitor (alphanumerics only).  Once created this cannot be changed.");
		html += get_form_table_spacer();
		
		// title
		html += get_form_table_row( 'Monitor Title', '<input type="text" id="fe_em_title" size="30" value="'+escape_text_field_value(monitor.title)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Enter a title of the monitor, for display purposes.");
		html += get_form_table_spacer();
		
		// display enabled
		html += get_form_table_row( 'Display', '<input type="checkbox" id="fe_em_display" value="1" ' + (monitor.display ? 'checked="checked"' : '') + '/><label for="fe_em_display">Show Monitor Graphs</label>' );
		html += get_form_table_caption( "Select whether this monitor should display a visible graph or not." );
		html += get_form_table_spacer();
		
		// group match
		html += get_form_table_row( 'Groups', this.renderGroupSelector('fe_em', monitor.group_match) );
		html += get_form_table_caption( "Select which groups the monitor should apply to.");
		html += get_form_table_spacer();
		
		// data source
		html += get_form_table_row( 'Data Source', '<input type="text" id="fe_em_source" size="40" class="mono" value="'+escape_text_field_value(monitor.source)+'" spellcheck="false"/><span class="link addme" onMouseUp="$P().showHostDataExplorer($(this).prev())"><i class="fa fa-search">&nbsp;</i>Explore...</span>' );
		html += get_form_table_caption( 
			"Enter an expression for evaluating the data source, e.g. <code>[stats/network/conns]</code>.<br/>" + 
			'If you need help, you can use the <span class="link" onMouseUp="$P().showHostDataExplorer(\'#fe_em_source\')">Server Data Explorer</span>, or view the <a href="https://github.com/jhuckaby/performa#data-sources" target="_blank">documentation</a>.'
		);
		html += get_form_table_spacer();
		
		// data regexp
		html += get_form_table_row( 'Data Match', '<input type="text" id="fe_em_data_match" size="40" class="mono" value="'+escape_text_field_value(monitor.data_match)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Optionally enter a regular expression to grab the desired data value out of a string.<br/>Surround the match with parenthesis to isolate it.  This is mainly for custom commands.");
		html += get_form_table_spacer();
		
		// data type (integer, float, bytes, seconds, percent)
		var type_items = [
			['integer', "Integer"],
			['float', "Float"],
			['bytes', "Bytes"],
			['seconds', "Seconds"],
			['milliseconds', "Milliseconds"]
			// ['percent', "Percent"]
		];
		html += get_form_table_row( 'Data Type', '<select id="fe_em_data_type">' + render_menu_options(type_items, monitor.data_type) + '</select>' );
		html += get_form_table_caption( "Select the data type for the monitor, which controls how the value is read and displayed." );
		html += get_form_table_spacer();
		
		// delta
		html += get_form_table_row( 'Delta', 
			'<div style=""><input type="checkbox" id="fe_em_delta" value="1" ' + (monitor.delta ? 'checked="checked"' : '') + ' onChange="$P().changeDeltaCheckbox(this)"/><label for="fe_em_delta">Calculate as Delta</label></div>' + 
			'<div style="margin-top:3px;"><input type="checkbox" id="fe_em_divide_by_delta" value="1" ' + (monitor.delta ? '' : 'disabled="disabled"') + ' ' + (monitor.divide_by_delta ? 'checked="checked"' : '') + '/><label for="fe_em_divide_by_delta">Divide by Time</label></div>' 
		);
		html += get_form_table_caption( "Optionally interpret the data value as a delta, and optionally divided by time.<br/>This is mainly for values that constantly count up, but we want to graph the difference over time." );
		html += get_form_table_spacer();
		
		// suffix
		html += get_form_table_row( 'Data Suffix', '<input type="text" id="fe_em_suffix" size="20" value="'+escape_text_field_value(monitor.suffix)+'" spellcheck="false"/>' );
		html += get_form_table_caption( "Optionally enter a suffix to be displayed after the data value, e.g. <code>/sec</code>.");
		html += get_form_table_spacer();
		
		// overview (merge_type)
		html += get_form_table_row( 'Overview', '<select id="fe_em_merge_type">' + render_menu_options([['', "None"], ['avg', "Average"], ['total', "Total"]], monitor.merge_type) + '</select>' );
		html += get_form_table_caption( "Select the method by which multi-server data should be merged together for the overview page.<br/>Select 'None' to hide this monitor on the overview page entirely." );
		html += get_form_table_spacer();
		
		// notes
		html += get_form_table_row( 'Notes', '<textarea id="fe_em_notes" style="width:500px; height:50px; resize:vertical;">'+escape_text_field_value(monitor.notes)+'</textarea>' );
		html += get_form_table_caption( "Optionally enter any notes for the monitor, for your own use." );
		html += get_form_table_spacer();
		
		return html;
	},
	
	changeDeltaCheckbox: function(elem) {
		// change delta checkbox, toggle disabled state of divide-by-delta
		if ($(elem).is(':checked')) $('#fe_em_divide_by_delta').removeAttr('disabled');
		else $('#fe_em_divide_by_delta').attr('disabled', true);
	},
	
	get_monitor_form_json: function() {
		// get api key elements from form, used for new or edit
		var monitor = this.monitor;
		
		monitor.id = $('#fe_em_id').val().replace(/\W+/g, '').toLowerCase();
		monitor.title = $('#fe_em_title').val();
		monitor.group_match = this.getGroupSelectorValue('fe_em');
		monitor.source = $('#fe_em_source').val();
		monitor.data_match = $('#fe_em_data_match').val();
		monitor.data_type = $('#fe_em_data_type').val();
		monitor.suffix = $('#fe_em_suffix').val();
		monitor.merge_type = $('#fe_em_merge_type').val();
		monitor.notes = $('#fe_em_notes').val();
		monitor.display = $('#fe_em_display').is(':checked') ? true : false;
		monitor.delta = $('#fe_em_delta').is(':checked') ? true : false;
		monitor.divide_by_delta = $('#fe_em_divide_by_delta').is(':checked') ? true : false;
		
		if (!monitor.id.length) {
			return app.badField('#fe_em_id', "Please enter a unique alphanumeric ID for the monitor.");
		}
		if (!monitor.title.length) {
			return app.badField('#fe_em_title', "Please enter a display title for the monitor.");
		}
		if (monitor.data_match) {
			// test regexp, as it was entered by a user
			try { new RegExp(monitor.data_match); }
			catch(err) {
				return app.badField('fe_em_data_match', "Invalid regular expression: " + err);
			}
		}
		
		return monitor;
	}
	
});
