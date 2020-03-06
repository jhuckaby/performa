Class.subclass( Page, "Page.Base", {	
	
	// milliseconds between dequeuing items
	queueDelay: 10,
	
	// graphColors: ["#7cb5ec", "#535358", "#90ed7d", "#f7a35c", "#8085e9", "#f15c80", "#e4d354", "#8085e8", "#8d4653", "#91e8e1"],
	graphColors: [ "#008FFB", "#00E396", "#FEB019", "#FF4560", "#775DD0", "#3F51B5", "#4CAF50", "#546E7A", "#D4526E", "#A5978B", "#C7F464", "#81D4FA", "#2B908F", "#F9A3A4", "#90EE7E", "#FA4443", "#449DD1", "#F86624", "#69D2E7", "#EA3546", "#662E9B", "#C5D86D", "#D7263D", "#1B998B", "#2E294E", "#F46036", "#E2C044", "#662E9B", "#F86624", "#F9C80E", "#EA3546", "#43BCCD", "#5C4742", "#A5978B", "#8D5B4C", "#5A2A27", "#C4BBAF", "#A300D6", "#7D02EB", "#5653FE", "#2983FF", "#00B1F2", "#03A9F4", "#33B2DF", "#4ECDC4", "#13D8AA", "#FD6A6A", "#F9CE1D", "#FF9800" ],
	
	graphSizeSettings: {
		full: {
			height: 400,
			line_thickness: 3,
			xaxis_ticks: 6,
			title_font_size: '16px'
		},
		half: {
			height: 300,
			line_thickness: 2,
			xaxis_ticks: 6,
			title_font_size: '15px'
		},
		third: {
			height: 200,
			line_thickness: 2,
			xaxis_ticks: 4,
			title_font_size: '14px'
		}
	},
	
	requireLogin: function(args) {
		// user must be logged into to continue
		var self = this;
		
		if (!app.user) {
			// require login
			app.navAfterLogin = this.ID;
			if (args && num_keys(args)) app.navAfterLogin += compose_query_string(args);
			
			this.div.hide();
			
			var session_id = app.getPref('session_id') || '';
			if (session_id) {
				Debug.trace("User has cookie, recovering session: " + session_id);
				
				app.api.post( 'user/resume_session', {
					session_id: session_id
				}, 
				function(resp) {
					if (resp.user) {
						Debug.trace("User Session Resume: " + resp.username + ": " + resp.session_id);
						app.hideProgress();
						app.doUserLogin( resp );
						Nav.refresh();
					}
					else {
						Debug.trace("User cookie is invalid, redirecting to login page");
						// Nav.go('Login');
						self.setPref('session_id', '');
						self.requireLogin(args);
					}
				} );
			}
			else if (app.config.external_users) {
				Debug.trace("User is not logged in, querying external user API");
				app.doExternalLogin();
			}
			else {
				Debug.trace("User is not logged in, redirecting to login page (will return to " + this.ID + ")");
				setTimeout( function() { Nav.go('Login'); }, 1 );
			}
			return false;
		}
		return true;
	},
	
	isAdmin: function() {
		// return true if user is logged in and admin, false otherwise
		// Note: This is used for UI decoration ONLY -- all privileges are checked on the server
		return( app.user && app.user.privileges && app.user.privileges.admin );
	},
		
	getNiceGroupList: function(group_match, link, width) {
		// convert regexp into comma-separated group title list
		if (group_match == '.+') return '(All)';
		if (group_match == '(?!)') return '(None)';
		
		var titles = [];
		group_match.split(/\W+/).forEach( function(group_id) {
			if (group_id.match(/^\w+$/)) {
				var group = find_object( config.groups, { id: group_id } );
				if (!group) group = { id: group_id, title: group_id };
				var title = '';
				if (link) title += '<a href="#Admin?sub=edit_group&id=' + group.id + '">';
				title += '<i class="mdi mdi-server-network">&nbsp;</i>' + group.title;
				if (link) title += '</a>';
				titles.push( title );
			}
		});
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		html += titles.join(', ');
		html += '</div>';
		
		return html;
	},
	
	getNiceGroup: function(item, link, width) {
		// get formatted group with icon, plus optional link
		if (!width) width = 500;
		if (!item) return '(None)';
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-server-network">&nbsp;</i>';
		if (link) {
			if (link === true) link = '#Admin?sub=edit_group&id=' + item.id;
			html += '<a href="' + link + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + item.title + '</span></a>';
		}
		else {
			html += icon + item.title;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceMonitor: function(item, link, width) {
		// get formatted monitor with icon, plus optional link
		if (!width) width = 500;
		if (!item) return '(None)';
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-chart-line">&nbsp;</i>';
		if (link) {
			html += '<a href="#Admin?sub=edit_monitor&id=' + item.id + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + item.title + '</span></a>';
		}
		else {
			html += icon + item.title;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceAlert: function(item, link, width) {
		// get formatted alert with icon, plus optional link
		if (!width) width = 500;
		if (!item) return '(None)';
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi ' + (item.enabled ? 'mdi-bell' : 'mdi-bell-off') + '">&nbsp;</i>';
		if (link) {
			html += '<a href="#Admin?sub=edit_alert&id=' + item.id + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + item.title + '</span></a>';
		}
		else {
			html += icon + item.title;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceCommand: function(item, link, width) {
		// get formatted command with icon, plus optional link
		if (!width) width = 500;
		if (!item) return '(None)';
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-console">&nbsp;</i>';
		if (link) {
			html += '<a href="#Admin?sub=edit_command&id=' + item.id + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + item.title + '</span></a>';
		}
		else {
			html += icon + item.title;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceAPIKey: function(item, link, width) {
		// get formatted api key with icon, plus optional link
		if (!item) return 'n/a';
		if (!width) width = 500;
		var key = item.api_key || item.key;
		var title = item.api_title || item.title;
		
		var html = '<div class="ellip" style="max-width:'+width+'px;">';
		var icon = '<i class="mdi mdi-key-variant">&nbsp;</i>';
		if (link && key) {
			html += '<a href="#Admin?sub=edit_api_key&id=' + item.id + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + title + '</span></a>';
		}
		else {
			html += icon + title;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceUsername: function(user, link, width) {
		// get formatted username with icon, plus optional link
		if (!user) return 'n/a';
		if ((typeof(user) == 'object') && (user.key || user.api_title)) {
			return this.getNiceAPIKey(user, link, width);
		}
		if (!width) width = 500;
		var username = user.username ? user.username : user;
		if (!username || (typeof(username) != 'string')) return 'n/a';
		
		var html = '<div class="ellip" style="max-width:'+width+'px;">';
		var icon = '<i class="fa fa-user">&nbsp;</i>';
		
		if (link) {
			html += '<a href="#Admin?sub=edit_user&username=' + username + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + username + '</span></a>';
		}
		else {
			html += icon + username;
		}
		html += '</div>';
		
		return html;
	},
	
	getNiceHostname: function(hostname, link, width) {
		// get formatted hostname with icon, plus optional link
		if (!width) width = 500;
		if (!hostname) return '(None)';
		
		var query = { hostname: hostname };
		if (this.args && this.args.sys) query.sys = this.args.sys;
		if (this.args && this.args.date) query.date = this.args.date;
		if (this.args && ('offset' in this.args)) query.offset = this.args.offset;
		if (this.args && this.args.length) query.length = this.args.length;
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-desktop-tower">&nbsp;</i>';
		if (link) {
			html += '<a href="#Server' + compose_query_string(query) + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + this.formatHostname(hostname) + '</span></a>';
		}
		else {
			html += icon + this.formatHostname(hostname);
		}
		html += '</div>';
		
		return html;
	},
	
	setGroupVisible: function(group, visible) {
		// set web groups of form fields visible or invisible, 
		// according to master checkbox for each section
		var selector = 'tr.' + group + 'group';
		if (visible) {
			if ($(selector).hasClass('collapse')) {
				$(selector).hide().removeClass('collapse');
			}
			$(selector).show(250);
		}
		else $(selector).hide(250);
		
		return this; // for chaining
	},
	
	checkUserExists: function(pre) {
		// check if user exists, update UI checkbox
		// called after field changes
		var username = trim($('#fe_'+pre+'_username').val().toLowerCase());
		var $elem = $('#d_'+pre+'_valid');
		
		if (username.match(/^[\w\-\.]+$/)) {
			// check with server
			// $elem.css('color','#444').html('<span class="fa fa-spinner fa-spin fa-lg">&nbsp;</span>');
			app.api.get('app/check_user_exists', { username: username }, function(resp) {
				if (resp.user_exists) {
					// username taken
					$elem.css('color','red').html('<span class="fa fa-exclamation-triangle fa-lg">&nbsp;</span>Username Taken');
				}
				else {
					// username is valid and available!
					$elem.css('color','green').html('<span class="fa fa-check-circle fa-lg">&nbsp;</span>Available');
				}
			} );
		}
		else if (username.length) {
			// bad username
			$elem.css('color','red').html('<span class="fa fa-exclamation-triangle fa-lg">&nbsp;</span>Bad Username');
		}
		else {
			// empty
			$elem.html('');
		}
	},
	
	check_add_remove_me: function($elem) {
		// check if user's e-mail is contained in text field or not
		var value = $elem.val().toLowerCase();
		var email = app.user.email.toLowerCase();
		var regexp = new RegExp( "\\b" + escape_regexp(email) + "\\b" );
		return !!value.match(regexp);
	},
	
	update_add_remove_me: function($elems) {
		// update add/remove me text based on if user's e-mail is contained in text field
		var self = this;
				
		$elems.each( function() {
			var $elem = $(this);
			var $span = $elem.next();
						
			if (self.check_add_remove_me($elem)) $span.html( '&raquo; Remove me' );
			else $span.html( '&laquo; Add me' );
		} );
	},
	
	add_remove_me: function($elem) {
		// toggle user's e-mail in/out of text field
		var value = trim( $elem.val().replace(/\,\s*\,/g, ',').replace(/^\s*\,\s*/, '').replace(/\s*\,\s*$/, '') );
		
		if (this.check_add_remove_me($elem)) {
			// remove e-mail
			var email = app.user.email.toLowerCase();
			var regexp = new RegExp( "\\b" + escape_regexp(email) + "\\b", "i" );
			value = value.replace( regexp, '' ).replace(/\,\s*\,/g, ',').replace(/^\s*\,\s*/, '').replace(/\s*\,\s*$/, '');
			$elem.val( trim(value) );
		}
		else {
			// add email
			if (value) value += ', ';
			$elem.val( value + app.user.email );
		}
		
		this.update_add_remove_me($elem);
	},
	
	get_custom_combo_unit_box: function(id, value, items, class_name) {
		// get HTML for custom combo text/menu, where menu defines units of measurement
		// items should be array for use in render_menu_options(), with an increasing numerical value
		if (!class_name) class_name = 'std_combo_unit_table';
		var units = 0;
		var value = parseInt( value || 0 );
		
		for (var idx = items.length - 1; idx >= 0; idx--) {
			var max = items[idx][0];
			if ((value >= max) && (value % max == 0)) {
				units = max;
				value = Math.floor( value / units );
				idx = -1;
			}
		}
		if (!units) {
			// no exact match, so default to first unit in list
			units = items[0][0];
			value = Math.floor( value / units );
		}
		
		return (
			'<table cellspacing="0" cellpadding="0" class="'+class_name+'"><tr>' + 
				'<td style="padding:0"><input type="text" id="'+id+'" style="width:30px;" value="'+value+'"/></td>' + 
				'<td style="padding:0"><select id="'+id+'_units">' + render_menu_options(items, units) + '</select></td>' + 
			'</tr></table>' 
		);
	},
	
	get_relative_time_combo_box: function(id, value, class_name, inc_seconds) {
		// get HTML for combo textfield/menu for a relative time based input
		// provides Minutes, Hours and Days units
		var unit_items = [[60,'Minutes'], [3600,'Hours'], [86400,'Days']];
		if (inc_seconds) unit_items.unshift( [1,'Seconds'] );
		
		return this.get_custom_combo_unit_box( id, value, unit_items, class_name );
	},
	
	get_relative_size_combo_box: function(id, value, class_name) {
		// get HTML for combo textfield/menu for a relative size based input
		// provides MB, GB and TB units
		var TB = 1024 * 1024 * 1024 * 1024;
		var GB = 1024 * 1024 * 1024;
		var MB = 1024 * 1024;
		
		return this.get_custom_combo_unit_box( id, value, [[MB,'MB'], [GB,'GB'], [TB,'TB']], class_name );
	},
	
	expand_fieldset: function($span) {
		// expand neighboring fieldset, and hide click control
		var $div = $span.parent();
		var $fieldset = $div.next();
		$fieldset.show( 350 );
		$div.hide( 350 );
	},
	
	collapse_fieldset: function($legend) {
		// collapse fieldset, and show click control again
		var $fieldset = $legend.parent();
		var $div = $fieldset.prev();
		$fieldset.hide( 350 );
		$div.show( 350 );
	},
	
	doInlineError(title, msg) {
		// show inline error on page
		this.onDeactivate(); // kill all graphs
		var html = '';
		html += '<fieldset class="inline_error">';
		html += '<div class="inline_error_title">' + title + '</div>';
		html += '<div class="inline_error_msg">' + msg + '</div>';
		html += '</fieldset>';
		this.div.removeClass('loading').html(html);
		$('#d_ctrl_range > .info_value').html( 'n/a' );
	},
	
	formatHostname: function(hostname) {
		// format hostname for display
		return app.formatHostname(hostname);
	},
	
	showControls: function(enabled) {
		// show or hide main date/size controls
		var self = this;
		var args = this.args;
		
		if (!enabled) {
			$('#d_controls').hide();
			return;
		}
		$('#d_controls').show();
		
		// possibly show server dropdown
		// (update contents as it can change over time)
		if (args.hostname) {
			if (!app.recent_hostnames[args.hostname]) app.recent_hostnames[args.hostname] = 1;
			$('#d_ctrl_server').show();
			$('#fe_ctrl_server').empty().append( app.getRecentServerMenuOptionsHTML() ).val( args.hostname );
		}
		else $('#d_ctrl_server').hide();
		
		// possibly show group dropdown
		if (args.group) {
			$('#d_ctrl_group').show();
			$('#fe_ctrl_group').val( args.group );
		}
		else $('#d_ctrl_group').hide();
		
		// populate scale menu
		var scale_html = '';
		scale_html += '<optgroup label="Live">' + 
				'<option value="live_60">Last Hour</option>' + 
				'<option value="live_180">Last 3 Hours</option>' + 
				'<option value="live_360">Last 6 Hours</option>' + 
				'<option value="live_720">Last 12 Hours</option>' + 
			'</optgroup>';
		if (args.hostname || args.group) {
			// group and server view have historical options
			scale_html += '<option value="" disabled></option>';
			scale_html += '<optgroup label="Historical">' + 
					'<option value="hist_hourly">Hourly</option>' + 
					'<option value="hist_daily">Daily</option>' + 
					'<option value="hist_monthly">Monthly</option>' + 
					'<option value="hist_yearly">Yearly</option>' + 
				'</optgroup>';
		}
		$('#fe_ctrl_mode').empty().append( scale_html );
		
		// determine scale mode
		// fe_ctrl_mode: live_60, live_180, live_360, live_720, hist_hourly, hist_daily, hist_monthly, hist_yearly
		if (args.date) {
			// historical
			$('#fe_ctrl_mode').val( 'hist_' + args.sys );
		}
		else {
			// some kind of live
			$('#fe_ctrl_mode').val( 'live_' + args.length );
		}
		
		// fe_ctrl_mode, d_ctrl_date, fe_ctrl_year, fe_ctrl_month, fe_ctrl_day, fe_ctrl_hour
		// btn_nav_left, btn_nav_right, btn_csi_third, btn_csi_half, btn_csi_full
		
		if (args.date) {
			// historical view
			$('#d_ctrl_date').show();
			
			if (args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})\D+(\d{2})$/)) {
				// hourly
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				var hh = RegExp.$4;
				$('#fe_ctrl_year').show().val( yyyy );
				$('#fe_ctrl_month').show().val( mm );
				$('#fe_ctrl_day').show().val( dd );
				$('#fe_ctrl_hour').show().val( hh );
			}
			else if (args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})$/)) {
				// daily
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				$('#fe_ctrl_year').show().val( yyyy );
				$('#fe_ctrl_month').show().val( mm );
				$('#fe_ctrl_day').show().val( dd );
				$('#fe_ctrl_hour').hide().val( "00" );
			}
			else if (args.date.match(/^(\d{4})\D+(\d{2})$/)) {
				// monthly
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				$('#fe_ctrl_year').show().val( yyyy );
				$('#fe_ctrl_month').show().val( mm );
				$('#fe_ctrl_day').hide().val( "01" );
				$('#fe_ctrl_hour').hide().val( "00" );
			}
			else if (args.date.match(/^(\d{4})$/)) {
				// yearly
				var yyyy = RegExp.$1;
				$('#fe_ctrl_year').show().val( yyyy );
				$('#fe_ctrl_month').hide().val( "01" );
				$('#fe_ctrl_day').hide().val( "01" );
				$('#fe_ctrl_hour').hide().val( "00" );
			}
		}
		else {
			// live view
			$('#d_ctrl_date').hide();
			
			// set date to today in menus
			var dargs = get_date_args( time_now() );
			$('#fe_ctrl_year').show().val( dargs.yyyy );
			$('#fe_ctrl_month').show().val( dargs.mm );
			$('#fe_ctrl_day').show().val( dargs.dd );
			$('#fe_ctrl_hour').show().val( dargs.hh );
		}
		
		// graph size
		$('#btn_csi_third, #btn_csi_half, #btn_csi_full').removeClass('selected');
		
		if (args.hostname || args.group) {
			$('#btn_csi_' + app.getPref('graph_size')).addClass('selected');
		}
		else {
			$('#btn_csi_' + app.getPref('ov_graph_size')).addClass('selected');
		}
		
		if (this.isRealTime()) {
			// data range (will be filled in later)
			$('#d_ctrl_range').show().find('.info_value').html('');
			
			// auto-refresh checkbox
			$('#d_ctrl_opts').show();
			$('#fe_ctrl_auto_refresh').prop('checked', app.getPref('auto_refresh') == '1' );
			$('#fe_ctrl_annotations').prop('checked', app.getPref('annotations') == '1' );
		}
		else {
			$('#d_ctrl_range').hide();
			$('#d_ctrl_opts').hide();
		}
	},
	
	navToArgs: function() {
		// recompose args into #URI and nav to it
		delete this.args.cachebust;
		Nav.go( '#' + this.ID + compose_query_string(this.args) );
	},
	
	navReplaceArgs: function() {
		// recompose args into #URI and replace the current history state with it
		// (this does NOT fire a hashchange)
		delete this.args.cachebust;
		history.replaceState( {}, "", '#' + this.ID + compose_query_string(this.args) );
	},
	
	setControlMode: function(mode) {
		// set new control (zoom) mode
		if (!mode) mode = $('#fe_ctrl_mode').val();
		var args = this.args;
		
		if (mode.match(/live_(\d+)$/)) {
			// one of the live modes: live_60, live_180, live_360, live_720
			var new_len = parseInt( RegExp.$1 );
			delete args.date;
			if (args.hostname || args.group) args.sys = 'hourly';
			args.offset = 0 - new_len;
			args.length = new_len;
			this.navToArgs();
		}
		else if (mode.match(/hist_(\w+)$/)) {
			// one of the historical modes: hist_hourly, hist_daily, hist_monthly, hist_yearly
			var new_sys = RegExp.$1;
			args.sys = new_sys;
			delete args.offset;
			delete args.length;
			
			switch (new_sys) {
				case 'hourly':
					args.date = $('#fe_ctrl_year').val() + '/' + $('#fe_ctrl_month').val() + '/' + $('#fe_ctrl_day').val() + '/' + $('#fe_ctrl_hour').val();
				break;
				
				case 'daily':
					args.date = $('#fe_ctrl_year').val() + '/' + $('#fe_ctrl_month').val() + '/' + $('#fe_ctrl_day').val();
				break;
				
				case 'monthly':
					args.date = $('#fe_ctrl_year').val() + '/' + $('#fe_ctrl_month').val();
				break;
				
				case 'yearly':
					args.date = $('#fe_ctrl_year').val();
				break;
			}
			
			this.navToArgs();
		}
	},
	
	setChartSize: function(size) {
		// change chart size (via user click)
		var args = this.args;
		var pref_key = (args.hostname || args.group) ? 'graph_size' : 'ov_graph_size';
		app.setPref(pref_key, size);
		
		for (var mon_id in this.graphs) {
			var graph = this.graphs[ mon_id ];
			var settings = this.graphSettings[ mon_id ];
			$('#' + settings.canvas_id).empty().removeAttr('style');
		}
		
		// change chart size and redraw
		this.div.find('div.graphs')
			.removeClass('size_full size_half size_third')
			.addClass('size_' + size);
		
		for (var mon_id in this.graphs) {
			var graph = this.graphs[ mon_id ];
			var options = this.getGraphConfig(mon_id);
			graph.updateOptions( options, false, false );
			graph.render();
		}
		
		// update buttons
		$('#btn_csi_third, #btn_csi_half, #btn_csi_full').removeClass('selected');
		$('#btn_csi_' + size).addClass('selected');
	},
	
	toggleAutoRefresh: function() {
		// toggle auto-refresh user preference, read from checkbox
		if ($('#fe_ctrl_auto_refresh').is(':checked')) {
			app.setPref('auto_refresh', '1'); // always strings
			
			// trigger a focus refresh here (to catch things up)
			app.onFocus();
		}
		else {
			app.setPref('auto_refresh', '0'); // always strings
		}
	},
	
	toggleAnnotations: function() {
		// toggle annotations user preference, read from checkbox
		if ($('#fe_ctrl_annotations').is(':checked')) {
			app.setPref('annotations', '1'); // always strings
		}
		else {
			app.setPref('annotations', '0'); // always strings
		}
		
		// trigger a graph redraw
		this.onThemeChange();
	},
	
	displayDataRange: function(min_date, max_date) {
		// display current data range
		// (min and max should be epoch seconds)
		var html = '';
		
		if (min_date && max_date) {
			var min_dargs = get_date_args( min_date );
			html = format_date( min_dargs, '[mmmm] [mday], [hour12]:[mi] [AMPM]' );
			
			if (max_date > min_date) {
				var max_dargs = get_date_args( max_date );
				html += ' - ' + format_date( max_dargs, '[hour12]:[mi] [AMPM]' );
			}
		}
		else {
			html = 'n/a';
		}
		
		$('#d_ctrl_range > .info_value').html( html );
	},
	
	onFilterKeyUp: function() {
		// user has pressed a key in the filter text field (debounced to 50ms)
		// hide/show graphs as needed, trigger scroll redraw
		app.monitorFilter = $('#fe_ctrl_filter').val().trim().toLowerCase();
		this.applyMonitorFilter();
	},
	
	applyMonitorFilter: function() {
		// override in home / group / server
	},
	
	arraySpread: function(value, len) {
		// generate array with `num` elements all containing `value`
		// this is for a crazy ApexCharts quirk
		var arr = [];
		for (var idx = 0; idx < len; idx++) {
			arr.push( value );
		}
		return arr;
	},
	
	getGraphConfig: function(id) {
		// get complete graph config (sans data) given ID
		var self = this;
		var args = this.args;
		var settings = this.graphSettings[ id ];
		
		var theme = app.getPref('theme') || 'light';
		var pref_key = (args.hostname || args.group) ? 'graph_size' : 'ov_graph_size';
		var size_settings = this.graphSizeSettings[ app.getPref(pref_key) ];
		var line_thickness = size_settings.line_thickness;
		
		// setup our legend under the chart
		var legend_opts = {
			show: true,
			labels: {
				colors: [ '#888' ]
			}
		};
		
		// disable legend if there is only one layer
		if ((settings.num_layers == 1) && !settings.show_legend) legend_opts.show = false;
		else if (settings.num_layers > config.max_legend_size) legend_opts.show = false;
		
		// setup our timeline options
		var time_fmt = '[hour12]:[mi][ampm]';
		switch (args.sys) {
			case 'hourly':
				time_fmt = '[hour12]:[mi][ampm]';
			break;
			
			case 'daily':
				time_fmt = '[hour12][ampm]';
			break;
			
			case 'monthly':
		 		time_fmt = '[mmm] [mday]';
			break;
			
			case 'yearly':
				time_fmt = '[mmm]';
			break;
		} // switch sys
		
		// custom or default colors
		var colors = settings.color ? [settings.color] : this.graphColors;
		
		// generate graph via ApexCharts
		var options = {
			chart: {
				type: 'line',
				height: size_settings.height,
				fontFamily: '"Lato", "Helvetica", sans-serif',
				animations: {
					enabled: false
				},
				toolbar: {
					show: false,
					tools: {
						download: false,
						selection: false,
						zoom: false,
						zoomin: false,
						zoomout: false,
						pan: false,
						reset: false
					},
					autoSelected: 'zoom'
				}
			},
			colors: colors,
			title: {
				text: settings.title,
				align: 'center',
				margin: 0,
				offsetX: 0,
				offsetY: args.group ? 10 : 0,
				floating: false,
				style: {
					fontFamily: '"LatoBold", "Helvetica", sans-serif',
					// fontSize: '16px',
					fontSize: size_settings.title_font_size,
					color: '#888'
				}
			},
			dataLabels: {
				enabled: false
			},
			stroke: {
				show: true,
				curve: 'smooth',
				lineCap: 'butt',
				colors: undefined,
				width: line_thickness,
				dashArray: 0
			},
			markers: {
				size: 0,
				style: 'hollow'
			},
			xaxis: {
				type: 'datetime',
				tickAmount: size_settings.xaxis_ticks,
				labels: {
					formatter: function(value, timestamp, index) {
						// xaxis timestamp
						if (index == size_settings.xaxis_ticks) return '';
						return format_date( timestamp / 1000, time_fmt );
					},
					style: {
						colors: this.arraySpread( '#888', 10 )
					},
					// trim: true
				},
				tooltip: {
					enabled: false
				}
			},
			yaxis: {
				show: true,
				min: 0,
				forceNiceScale: true,
				labels: {
					formatter: function(value) {
						// format data value for both yaxis and tooltip here
						if (isNaN(value) || (value === null)) return 'n/a';
						if (value < 0) return '';
						return '' + self.formatDataValue(value, settings);
					},
					style: {
						color: '#888'
					}
				}
			},
			tooltip: {
				x: {
					enabled: true,
					shared: true,
					formatter: function(timestamp) {
						// tooltip timestamp
						return format_date( timestamp / 1000, "[yyyy]/[mm]/[dd] [hour12]:[mi][ampm]" );
					}
				},
				theme: theme
			},
			grid: {
				show: true,
				borderColor: 'rgba(128, 128, 128, 0.25)',
				xaxis: {
					lines: {
						show: true,
						
					}
				},
				yaxis: {
					lines: {
						show: true,
						
					}
				}
			},
			legend: legend_opts
		}; // options
		
		if ((settings.num_layers == 1) && !settings.no_fill) {
			// single layer, go area with alpha fill
			options.chart.type = 'area';
			options.fill = {
				type: 'solid',
				opacity: 0.5
			};
		}
		else {
			options.fill = {
				opacity: 1.0
			};
		}
		
		// allow config overrides
		if (config.graph_overrides && config.graph_overrides.all_sizes) {
			for (var path in config.graph_overrides.all_sizes) {
				setPath( options, path, config.graph_overrides.all_sizes[path] );
			}
		}
		
		var size_key = app.getPref(pref_key);
		if (config.graph_overrides && config.graph_overrides[size_key]) {
			for (var path in config.graph_overrides[size_key]) {
				setPath( options, path, config.graph_overrides[size_key][path] );
			}
		}
		
		return options;
	},
	
	createGraph: function(settings) {
		// generate graph given settings and page layout
		var self = this;
		var args = this.args;
		
		// save settings based on ID
		if (!this.graphSettings) this.graphSettings = {};
		this.graphSettings[ settings.id ] = settings;
		
		var datasets = settings.datasets || null;
		if (!datasets) {
			datasets = [];
			
			for (var idx = 0, len = settings.num_layers; idx < len; idx++) {
				var dataset = {
					name: "",
					data: []
				};
				
				// labels may be specified as array
				if (settings.labels) dataset.name = settings.labels[idx];
				
				datasets.push( dataset );
			} // foreach dataset
		} // create empty datasets
		
		var options = this.getGraphConfig(settings.id);
		options.series = datasets;
		
		var chart = new ApexCharts(
			$('#' + settings.canvas_id).get(0),
			options
		);
		
		chart.render();
		return chart;
	},
	
	crushData: function(data) {
		// crush data (average multiple rows together) if applicable
		// do this much more aggressively in safari, which is TERRIBLE at rendering complex SVGs
		var amount = 0;
		
		if (app.safari) {
			if (data.length >= 800) amount = 4;
			else if (data.length >= 600) amount = 3;
			else if (data.length >= 400) amount = 2;
		}
		else {
			// all other browsers only crush after 800 rows
			if (data.length >= 800) amount = 2;
		}
		
		// crush needed at all?
		if (amount < 2) return data;
		
		// crush time
		var new_data = [];
		var total = 0;
		var count = 0;
		
		for (var idx = 0, len = data.length; idx < len; idx++) {
			if (data[idx].y === null) {
				new_data.push( data[idx] );
			}
			else {
				total += data[idx].y;
				count++;
				if (count >= amount) {
					new_data.push({ x: data[idx].x, y: total / count });
					total = 0; count = 0;
				}
			}
		}
		if (count) {
			new_data.push({ x: data[ data.length - 1 ].x, y: total / count });
		}
		return new_data;
	},
	
	formatDataValue: function(value, mon_def) {
		// format single data value given monitor config definition
		var output = value;
		
		switch (mon_def.data_type) {
			case 'bytes': 
				output = get_text_from_bytes( Math.floor(value) ).replace(/bytes/, 'B');
			break;
			case 'seconds': output = get_text_from_seconds( Math.floor(value), true, true ); break;
			case 'milliseconds': output = commify( Math.floor(value) ); break;
			case 'integer': output = commify( Math.floor(value) ); break;
			case 'percent': output = '' + Math.floor(value); break;
			case 'string': output = value; break;
			default:
				if (output == Math.floor(output)) output = '' + output + '.0';
				else output = '' + short_float(output);
			break;
		}
		
		if (mon_def.suffix) output += mon_def.suffix;
		return output;
	},
	
	b64ToUint6: function(nChr) {
		// convert base64 encoded character to 6-bit integer
		// from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding
		return nChr > 64 && nChr < 91 ? nChr - 65
			: nChr > 96 && nChr < 123 ? nChr - 71
			: nChr > 47 && nChr < 58 ? nChr + 4
			: nChr === 43 ? 62 : nChr === 47 ? 63 : 0;
	},

	base64DecToArr: function(sBase64, nBlocksSize) {
		// convert base64 encoded string to Uintarray
		// from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding
		var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ""), nInLen = sB64Enc.length,
			nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2, 
			taBytes = new Uint8Array(nOutLen);
		
		for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
			nMod4 = nInIdx & 3;
			nUint24 |= this.b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
			if (nMod4 === 3 || nInLen - nInIdx === 1) {
				for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
					taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
				}
				nUint24 = 0;
			}
		}
		return taBytes;
	},
	
	copyGraphImage: function(elem) {
		// generate large offscreen graph, submit to server and copy URL to clipboard
		var self = this;
		var $elem = $(elem);
		var args = this.args;
		var $cont = $elem.closest('div.graph_container');
		var mon_id = $cont.data('mon');
		var mon_def = find_object( config.monitors, { id: mon_id } );
		var graph = this.graphs[mon_id];
		var combo_id = '';
		var group_id = '';
		
		// overview page uses a different ID system
		if (!graph && $cont.data('group')) {
			group_id = $cont.data('group');
			combo_id = group_id + '_' + mon_id;
			graph = this.graphs[combo_id];
		}
		
		// show indeterminate progress in icon
		$elem.removeClass().addClass('mdi mdi-clipboard-arrow-up-outline mdi-lg');
		
		// find right side of data for timestamp
		var max_x = 0;
		graph.w.config.series.forEach( function(dataset) {
			if (dataset.data && dataset.data.length && (dataset.data[dataset.data.length - 1].x > max_x)) {
				max_x = dataset.data[dataset.data.length - 1].x;
			}
		} );
		
		// get date stamp of right side of chart
		var dargs = get_date_args( new Date(max_x) );
		
		// generate title, path and filename
		var unique_id = get_unique_id(16, app.username);
		
		var title = mon_def.title;
		if (combo_id) {
			title = ucfirst( mon_def.merge_type ) + " " + mon_def.title;
		}
		if (args.hostname) {
			title += ' - ' + app.formatHostname(args.hostname);
		}
		else if (args.group) {
			if (app.getPref('ggt_' + mon_id)) {
				title = ucfirst( app.getPref('ggt_' + mon_id) ) + " " + mon_def.title;
			}
			var group_def = find_object( config.groups, { id: args.group } );
			if (group_def) title += ' - ' + group_def.title;
		}
		else if (group_id) {
			var group_def = find_object( config.groups, { id: group_id } );
			if (group_def) title += ' - ' + group_def.title;
		}
		
		var path = '';
		switch (args.sys) {
			case 'hourly':
				path = dargs.yyyy_mm_dd;
				title += ' - ' + get_nice_date(max_x / 1000);
				path += '/' + dargs.hh;
				title += ' - ' + dargs.hour12 + ' ' + dargs.ampm.toUpperCase();
			break;
			
			case 'daily':
				path = dargs.yyyy_mm_dd;
				title += ' - ' + get_nice_date(max_x / 1000);
			break;
			
			case 'monthly': 
				path = dargs.yyyy + '/' + dargs.mm; 
				var month = window._months[dargs.mon - 1][1];
				title += ' - ' + month + ' ' + dargs.year;
			break;
			
			case 'yearly': 
				path = dargs.yyyy;
				title += ' - ' + dargs.year;
			break;
			
			default:
				// i.e. overview page
				path = dargs.yyyy_mm_dd + '/' + dargs.hh;
				title += ' - ' + dargs.yyyy_mm_dd;
			break;
		} // sys
		
		if (args.hostname) path += '/' + args.hostname;
		else if (args.group) path += '/' + args.group;
		else if (group_id) path += '/' + group_id; // overview
		
		path += '/' + mon_id + '/' + unique_id + '.png';
		
		// copy final URL to clipboard
		var clip_url = config.base_app_url + '/files/' + path;
		copyToClipboard( clip_url );
		Debug.trace('upload', "URL copied to clipboard: " + clip_url);
		
		// hide some elements to avoid printing them on exported svg
		const xcrosshairs = graph.w.globals.dom.baseEl.querySelector( '.apexcharts-xcrosshairs' );
		const ycrosshairs = graph.w.globals.dom.baseEl.querySelector( '.apexcharts-ycrosshairs' );
		if (xcrosshairs) {
			xcrosshairs.setAttribute('x', -500);
			xcrosshairs.setAttribute('x1', -500);
			xcrosshairs.setAttribute('x2', -500);
		}
		if (ycrosshairs) {
			ycrosshairs.setAttribute('y', -100);
			ycrosshairs.setAttribute('y1', -100);
			ycrosshairs.setAttribute('y2', -100);
		}
		
		// can we get away with changing the title?
		var title_elem = graph.w.globals.dom.baseEl.querySelector( '.apexcharts-title-text' );
		var old_title = title_elem.innerHTML;
		title_elem.innerHTML = title;
		
		const w = graph.w;
		
		const canvas = document.createElement('canvas');
		canvas.width = w.globals.svgWidth * 2; // retina
		canvas.height = w.globals.svgHeight * 2; // retina
		
		var ctx = canvas.getContext('2d');
		ctx.scale(2, 2); // retina
		
		if (w.config.chart.background !== 'transparent') {
			ctx.fillStyle = w.config.chart.background;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		
		var img = new Image();
		img.crossOrigin = 'anonymous';
		
		const svgData = w.globals.dom.Paper.svg();
		const svgUrl = 'data:image/svg+xml,' + encodeURIComponent(svgData);
		
		// reset title quickly
		title_elem.innerHTML = old_title;
		
		img.onload = function() {
			ctx.drawImage(img, 0, 0);
			var image_data_uri = canvas.toDataURL('image/png');
			
			// upload image to server
			var api_url = config.base_api_uri + '/app/upload_file' + compose_query_string({
				session_id: app.session_id,
				path: path
			});
			
			// extract raw base64 data from Data URI
			var raw_image_data = image_data_uri.replace(/^data\:image\/\w+\;base64\,/, '');
			
			Debug.trace('upload', "Uploading graph image to server: " + api_url);
			
			// contruct use AJAX object
			var http = new XMLHttpRequest();
			http.open("POST", api_url, true);
			
			// completion handler
			http.onload = function() {
				if (http.status != 200) {
					var code = http.status;
					var desc = http.statusText;
					Debug.trace( 'api', "Network Error: " + code + ": " + desc );
					app.doError( "Network Error: " + code + ": " + desc );
					
					// reset icon
					$elem.removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
					return;
				}
				
				var text = http.responseText;
				Debug.trace( 'api', "Received response from server: " + text );
				var resp = null;
				try { resp = JSON.parse(text); }
				catch (e) {
					// JSON parse error
					var desc = "JSON Error: " + e.toString();
					app.doError(desc);
					
					// reset icon
					$elem.removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
					return;
				}
				// success, but check json for server error code
				if (resp) {
					if (('code' in resp) && (resp.code != 0)) {
						// an error occurred within the JSON response
						app.doError("Error: " + resp.description);
						
						// reset icon
						$elem.removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
						return;
					}
				}
				
				// show success in icon
				$elem.removeClass().addClass('mdi mdi-clipboard-check-outline mdi-lg success');
			}; // http.onload
			
			// create a blob and decode our base64 to binary
			var blob = new Blob( [ self.base64DecToArr(raw_image_data) ], { type: 'image/png' } );
			
			// stuff into a form, so servers can easily receive it as a standard file upload
			var form = new FormData();
			form.append( 'file1', blob, 'upload.png' );
			
			// send data to server
			http.send(form);
		}; // img.onload
		
		img.src = svgUrl;
	},
	
	jumpToServer: function(hostname) {
		// jump to specific server detail page
		var args = this.args || {};
		if (!hostname) hostname = $('#fe_ctrl_server').val();
		
		// try to preserve as many args as possible
		args.hostname = hostname;
		delete args.group;
		delete args.cachebust;
		delete args.sub;
		delete args.id;
		
		if (args.date) {
			delete args.offset;
			delete args.length;
		}
		
		Nav.go( '#Server' + compose_query_string(args) );
		
		// reset "jump to" menu
		$('#fe_jump_to_server').val('');
	},
	
	jumpToGroup: function(group_id) {
		// jump to specific group detail page
		var args = this.args || {};
		if (!group_id) group_id = $('#fe_ctrl_group').val();
		
		// try to preserve as many args as possible
		args.group = group_id;
		delete args.hostname;
		delete args.cachebust;
		delete args.sub;
		delete args.id;
		
		if (args.date) {
			delete args.offset;
			delete args.length;
		}
		
		Nav.go( '#Group' + compose_query_string(args) );
		
		// reset "jump to" menu
		$('#fe_jump_to_group').val('');
	},
	
	navCtrlBack: function() {
		// jump backward in time
		var args = this.args;
		
		if (args.date) {
			// historical
			if ((args.sys == 'hourly') && args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})\D+(\d{2})$/)) {
				// jump to previous day
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				var hh = RegExp.$4;
				var epoch = get_time_from_args({
					year: parseInt(yyyy),
					mon: parseInt(mm),
					mday: parseInt(dd),
					hour: parseInt(hh),
					min: 0,
					sec: 0
				});
				var dargs = get_date_args( epoch - 1 );
				args.date = dargs.yyyy_mm_dd + '/' + dargs.hh;
			}
			else if ((args.sys == 'daily') && args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})$/)) {
				// jump to previous day
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				var epoch = get_time_from_args({
					year: parseInt(yyyy),
					mon: parseInt(mm),
					mday: parseInt(dd),
					hour: 0,
					min: 0,
					sec: 0
				});
				var dargs = get_date_args( epoch - 1 );
				args.date = dargs.yyyy_mm_dd;
			}
			else if ((args.sys == 'monthly') && args.date.match(/^(\d{4})\D(\d{2})$/)) {
				// jump to previous month
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var epoch = get_time_from_args({
					year: parseInt(yyyy),
					mon: parseInt(mm),
					mday: 1,
					hour: 0,
					min: 0,
					sec: 0
				});
				var dargs = get_date_args( epoch - 1 );
				args.date = dargs.yyyy + '/' + dargs.mm;
			}
			else if ((args.sys == 'yearly') && args.date.match(/^(\d{4})$/)) {
				// jump to previous year
				var yyyy = parseInt( RegExp.$1 );
				yyyy--;
				if (yyyy < config.first_year) return;
				args.date = '' + yyyy;
			}
			
			delete args.offset;
			delete args.length;
		}
		else {
			// live, switch to hourly historical
			var dargs = get_date_args( time_now() - 3600 );
			args.sys = 'hourly';
			args.date = dargs.yyyy_mm_dd + '/' + dargs.hh;
			delete args.offset;
			delete args.length;
		}
		
		this.navToArgs();
	},
	
	navCtrlForward: function() {
		// jump forward in time
		var args = this.args;
		
		if (args.date) {
			// historical
			var max_epoch = normalize_time( time_now(), { min: 0, sec: 0 } );
			
			if ((args.sys == 'hourly') && args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})\D+(\d{2})$/)) {
				// jump to next hour
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				var hh = RegExp.$4;
				var epoch = get_time_from_args({
					year: parseInt(yyyy),
					mon: parseInt(mm),
					mday: parseInt(dd),
					hour: parseInt(hh),
					min: 59,
					sec: 59
				});
				epoch++;
				if (epoch >= max_epoch) {
					// switch to realtime hourly
					delete args.date;
					args.offset = -60;
					args.length = 60;
					this.navToArgs();
					return;
				}
				else {
					var dargs = get_date_args( epoch );
					args.date = dargs.yyyy_mm_dd + '/' + dargs.hh;
				}
			}
			else if ((args.sys == 'daily') && args.date.match(/^(\d{4})\D+(\d{2})\D+(\d{2})$/)) {
				// jump to next day
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				var dd = RegExp.$3;
				var epoch = get_time_from_args({
					year: parseInt(yyyy),
					mon: parseInt(mm),
					mday: parseInt(dd),
					hour: 23,
					min: 59,
					sec: 59
				});
				epoch++;
				if (epoch > max_epoch) return;
				var dargs = get_date_args( epoch );
				args.date = dargs.yyyy_mm_dd;
			}
			else if ((args.sys == 'monthly') && args.date.match(/^(\d{4})\D(\d{2})$/)) {
				// jump to next month
				var yyyy = RegExp.$1;
				var mm = RegExp.$2;
				yyyy = parseInt(yyyy);
				mm = parseInt(mm);
				mm++; if (mm > 12) { mm = 1; yyyy++; }
				var epoch = get_time_from_args({
					year: yyyy,
					mon: mm,
					mday: 1,
					hour: 0,
					min: 0,
					sec: 0
				});
				if (epoch > max_epoch) return;
				var dargs = get_date_args( epoch );
				args.date = dargs.yyyy + '/' + dargs.mm;
			}
			else if ((args.sys == 'yearly') && args.date.match(/^(\d{4})$/)) {
				// jump to next year
				var yyyy = parseInt( RegExp.$1 );
				yyyy++;
				if (yyyy > yyyy()) return;
				args.date = '' + yyyy;
			}
			
			delete args.offset;
			delete args.length;
		}
		else {
			// live (no-op)
			return;
		}
		
		this.navToArgs();
	},
	
	renderGroupSelector: function(dom_prefix, cur_value) {
		// render expanding checkbox list for multi-group selection
		// provide an "All Groups" checkbox which collapses list
		var html = '';
		var group_is_all = (cur_value == '.+');
		
		// convert regexp match into hash of group ids
		var groups_selected = {};
		cur_value.split(/\W+/).forEach( function(group_id) {
			if (group_id.match(/^\w+$/)) groups_selected[group_id] = true;
		});
		
		html += '<div class="group_sel_wrapper">';
		
		// all groups checkbox
		html += '<div class="priv_group_admin">';
		html += '<input type="checkbox" id="' + dom_prefix + '_all" value="1" ' + 
			(group_is_all ? 'checked="checked" ' : '') + 'onChange="$P().toggleGroupSelectorAll(this)">';
		html += '<label for="' + dom_prefix + '_all">All Groups</label>';
		html += '</div>';
		
		// individual groups
		for (var idx = 0, len = config.groups.length; idx < len; idx++) {
			var group = config.groups[idx];
			var has_group = !!groups_selected[ group.id ];
			var group_disabled = !!group_is_all;
			
			html += '<div class="priv_group_other">';
			html += '<input type="checkbox" id="' + dom_prefix + '_group_' + group.id + '" value="1" ' + 
				(has_group ? 'checked="checked" ' : '') + ' ' + (group_disabled ? 'disabled="disabled"' : '') + '>';
			html += '<label for="' + dom_prefix + '_group_' + group.id + '">' + group.title + '</label>';
			html += '</div>';
		}
		
		html += '</div>'; // wrapper
		
		return html;
	},
	
	toggleGroupSelectorAll: function(elem) {
		// toggle "All Groups" checkbox, swap visibility of group list
		var is_checked = $(elem).is(':checked');
		/*if (is_checked) this.div.find('div.priv_group_other').hide(250);
		else this.div.find('div.priv_group_other').show(250);*/
		if (is_checked) {
			this.div.find('div.priv_group_other > input').attr('disabled', true);
		}
		else {
			this.div.find('div.priv_group_other > input').removeAttr('disabled');
		}
	},
	
	getGroupSelectorValue: function(dom_prefix) {
		// get selection of all checkbox in group list, return regexp match string
		if (this.div.find('#' + dom_prefix + '_all').is(':checked')) return '.+';
		
		var group_list = [];
		for (var idx = 0, len = config.groups.length; idx < len; idx++) {
			var group = config.groups[idx];
			if (this.div.find('#' + dom_prefix + '_group_' + group.id).is(':checked')) {
				group_list.push( group.id );
			}
		}
		
		if (!group_list.length) return '(?!)'; // never match
		return '^(' + group_list.join('|') + ')$';
	},
	
	initQueue: function() {
		// setup for queue system
		this.queue = [];
		this.queueIndex = {};
		delete this.queueTimer;
	},
	
	enqueue: function(handler, id) {
		// simple queue system, invokes handler once per N milliseconds (default 10)
		if (!this.queue) this.queue = [];
		var item = {
			handler: handler,
			id: id || ''
		};
		
		if (id) {
			if (!this.queueIndex) this.queueIndex = {};
			if (this.queueIndex[id]) return; // dupe, silently skip
			this.queueIndex[id] = item;
		}
		
		this.queue.push(item);
		
		if (!this.queueTimer) {
			this.queueTimer = setTimeout( this.dequeue.bind(this), this.queueDelay );
		}
	},
	
	dequeue: function() {
		// dequeue single item and launch it
		delete this.queueTimer;
		
		var item = this.queue.shift();
		if (!item) return;
		if (item.id) delete this.queueIndex[item.id];
		
		item.handler();
		
		if (this.queue.length && !this.queueTimer) {
			this.queueTimer = setTimeout( this.dequeue.bind(this), this.queueDelay );
		}
	},
	
	isRealTime: function() {
		// return true if current page is in realtime mode, false otherwise
		var args = this.args;
		if (!args.date && (args.sys == 'hourly') && (args.offset == 0 - args.length)) {
			return true;
		}
		else {
			return false;
		}
	},
	
	showHostDataExplorer: function($elem) {
		// show dialog allowing user to explore the JSON data from servers
		// and pick a particular key, which will populate a text field using [data/path] syntax
		var self = this;
		var html = '';
		if (typeof($elem) == 'string') $elem = $($elem);
		
		if (!num_keys(app.recent_hostnames)) {
			return app.doError("Sorry, no servers have sent any data into the system yet.");
		}
		
		html += '<div style="width:500px; font-size:12px; margin-bottom:20px;">';
		html += "Use this tool to help locate a specific server metric, by exploring the actual data being sent in by your servers.  Click on any metric key below to construct a correct <code>[data/path]</code> and insert it back into the form field.";
		html += '</div>';
		
		html += '<center><table>' + 
			// get_form_table_spacer() + 
			get_form_table_row('Server:', '<select id="fe_explore_server" onChange="$P().populateHostDataExplorer($(this).val())">' + app.getRecentServerMenuOptionsHTML() + '</select>') + 
			get_form_table_caption("Select the server hostname to explore metrics for.");
			// get_form_table_spacer('transparent');
		
		html += '<tr><td colspan="2"><div id="d_explore_area" class="explore_area"></div></td></tr>';
		
		html += // get_form_table_spacer('transparent') + 
			get_form_table_row('Selection:', '<input type="text" id="fe_explore_sel" class="mono" style="width:300px">') + 
			get_form_table_caption("Your formatted selection will appear here.");
		
		html += '</table></center>';
		
		app.customConfirm( '<i class="fa fa-search">&nbsp;</i>Server Data Explorer', html, "Apply", function(result) {
			app.clearError();
			
			if (result) {
				var text_to_insert = $('#fe_explore_sel').val();
				var text = $elem.val().trim();
				if (text.length) text += " ";
				text += text_to_insert;
				Dialog.hide();
				$elem.focus().val('').val( text ); // this trick places the caret at the end
			} // user clicked yes
		} ); // app.confirm
		
		this.populateHostDataExplorer( $('#fe_explore_server').val() || first_key(app.recent_hostnames) );
	},
	
	populateHostDataExplorer: function(hostname) {
		// fetch data for specific server and populate explorer dialog
		var self = this;
		var $cont = $('#d_explore_area');
		$cont.empty().addClass('loading');
		
		app.api.get( 'app/view/verbose', { hostname: hostname }, function(resp) {
			// got data, format into tree
			var html = '';
			var metadata = resp.metadata;
			var branches = [{ path: "", key: "", value: metadata.data, indent: -1 }];
			
			while (branches.length) {
				var branch = branches.shift();
				var indent_px = Math.max(0, branch.indent) * 20;
				
				if (branch.value && (typeof(branch.value) == 'object')) {
					if (branch.key) {
						html += '<div class="explore_item" style="margin-left:' + indent_px + 'px"><i class="fa fa-folder-open-o">&nbsp;</i><b>' + branch.key + '</b></div>';
					}
					hash_keys_to_array(branch.value).sort( function(a, b) {
						var ta = typeof( branch.value[a] );
						var tb = typeof( branch.value[b] );
						if ((ta == 'object') && (tb != 'object')) return -1;
						else if ((ta != 'object') && (tb == 'object')) return 1;
						else return a.localeCompare(b);
					} ).reverse().forEach( function(key) {
						branches.unshift({ 
							path: branch.path + '/' + branch.key, 
							key: key, 
							value: branch.value[key], 
							indent: branch.indent + 1 
						});
					});
				}
				else {
					html += '<div class="explore_item" style="margin-left:' + indent_px + 'px"><span class="link" data-path="' + branch.path + '/' + branch.key + '" onMouseUp="$P().pickHostDataKey(this)"><i class="fa fa-file-o">&nbsp;</i><b>' + branch.key + '</b></span>:&nbsp;' + JSON.stringify(branch.value) + '</div>';
				}
			}
			
			$cont.removeClass('loading').html( html );
		}, 
		function(err) {
			$cont.removeClass('loading').html(
				'<div style="line-height:300px; text-align:center">' + err.description  + '</div>' 
			);
		} );
	},
	
	pickHostDataKey: function(elem) {
		// user clicked on a host data explorer JSON path key
		// populate it into the staging text area
		var path = $(elem).data('path').replace(/\/+/g, '/').replace(/^\//, '');
		$('#fe_explore_sel').val( '[' + path + ']' ).focus();
	},
	
	getPercentBarHTML: function(amount, width) {
		// render simple percentage bar with green / yellow / red colors
		var html = '';
		html += '<div class="percent_bar_container" style="width:' + width + 'px" title="' + pct(amount) + '">';
		
		var color = '';
		if (amount >= 0.75) color = 'rgba(255, 0, 0, 0.75)';
		else if (amount >= 0.5) color = 'rgba(224, 224, 0, 0.85)';
		else color = '#080';
		
		var color_width = Math.floor( amount * width );
		html += '<div class="percent_bar_inner" style="background-color:' + color + '; width:' + color_width + 'px"></div>';
		html += '</div>';
		return html;
	},
	
	getCPUTableHTML: function(cpus) {
		// render HTML for CPU detail table
		var self = this;
		var html = '';
		html += '<legend>CPU Details</legend>';
		html += '<table class="fieldset_table" width="100%">';
		html += '<tr>';
			html += '<th>CPU #</th>';
			html += '<th>System %</th>';
			html += '<th>User %</th>';
			html += '<th>Nice %</th>';
			html += '<th>I/O Wait %</th>';
			html += '<th>Hard IRQ %</th>';
			html += '<th>Soft IRQ %</th>';
			html += '<th>Total %</th>';
		html += '</tr>';
		
		var cpu_list = [];
		for (var idx = 0, len = num_keys(cpus); idx < len; idx++) {
			var key = 'cpu' + idx;
			if (cpus[key]) cpu_list.push( cpus[key] );
		}
		
		cpu_list.forEach( function(cpu, idx) {
			html += '<tr>';
			html += '<td><b>#' + Math.floor( idx + 1 ) + '</b></td>';
			html += '<td>' + pct( cpu.system || 0, 100 ) + '</td>';
			html += '<td>' + pct( cpu.user || 0, 100 ) + '</td>';
			html += '<td>' + pct( cpu.nice || 0, 100 ) + '</td>';
			html += '<td>' + pct( cpu.iowait || 0, 100 ) + '</td>';
			html += '<td>' + pct( cpu.irq || 0, 100 ) + '</td>';
			html += '<td>' + pct( cpu.softirq || 0, 100 ) + '</td>';
			
			var total = 100 - (cpu.idle || 0);
			html += '<td>' + self.getPercentBarHTML( total / 100, 200 ) + '</td>';
			html += '</tr>';
		});
		
		html += '</table>';
		return html;
	},
	
	getBasicTable: function() {
		// get html for sorted table (fake pagination, for looks only)
		// overriding function in page.js for adding ids per row
		var html = '';
		var args = null;
		
		if (arguments.length == 1) {
			// custom args calling convention
			args = arguments[0];
		}
		else {
			// classic calling convention
			args = {
				rows: arguments[0],
				cols: arguments[1],
				data_type: arguments[2],
				callback: arguments[3]
			};
		}
		
		var rows = args.rows;
		var cols = args.cols;
		var data_type = args.data_type;
		var callback = args.callback;
		
		// pagination
		html += '<div class="pagination">';
		html += '<table cellspacing="0" cellpadding="0" border="0" width="100%"><tr>';
		
		html += '<td align="left" width="33%">';
		if (cols.headerLeft) html += cols.headerLeft;
		else html += commify(rows.length) + ' ' + pluralize(data_type, rows.length) + '';
		html += '</td>';
		
		html += '<td align="center" width="34%">';
			html += cols.headerCenter || '&nbsp;';
		html += '</td>';
		
		html += '<td align="right" width="33%">';
			html += cols.headerRight || 'Page 1 of 1';
		html += '</td>';
		
		html += '</tr></table>';
		html += '</div>';
		
		html += '<div style="margin-top:5px;">';
		
		var tattrs = args.attribs || {};
		if (!tattrs.class) tattrs.class = 'data_table ellip';
		if (!tattrs.width) tattrs.width = '100%';
		html += '<table ' + compose_attribs(tattrs) + '>';
		
		html += '<tr><th style="white-space:nowrap;">' + cols.join('</th><th style="white-space:nowrap;">') + '</th></tr>';
		
		for (var idx = 0, len = rows.length; idx < len; idx++) {
			var row = rows[idx];
			var tds = callback(row, idx);
			if (tds.insertAbove) html += tds.insertAbove;
			html += '<tr' + (tds.className ? (' class="'+tds.className+'"') : '') + (row.id ? (' data-id="'+row.id+'"') : '') + '>';
			html += '<td>' + tds.join('</td><td>') + '</td>';
			html += '</tr>';
		} // foreach row
		
		if (!rows.length) {
			html += '<tr><td colspan="'+cols.length+'" align="center" style="padding-top:10px; padding-bottom:10px; font-weight:bold;">';
			html += 'No '+pluralize(data_type)+' found.';
			html += '</td></tr>';
		}
		
		html += '</table>';
		html += '</div>';
		
		return html;
	},
	
	setupDraggableTable: function(args) {
		// allow table rows to be drag-sorted
		// args: { table_sel, handle_sel, drag_ghost_sel, drag_ghost_x, drag_ghost_y, callback }
		var $table = $(args.table_sel);
		var $rows = $table.find('tr').slice(1); // omit header row
		var $cur = null;
		
		var createDropZone = function($tr, idx, pos) {
			pos.top -= Math.floor( pos.height / 2 );
			
			$('<div><div class="dz_bar"></div></div>')
				.addClass('dropzone')
				.css({
					left: '' + pos.left + 'px',
					top: '' + pos.top + 'px',
					width: '' + pos.width + 'px',
					height: '' + pos.height + 'px'
				})
				.appendTo('body')
				.on('dragover', function(event) {
					var e = event.originalEvent;
					e.preventDefault();
					e.dataTransfer.effectAllowed = "move";
				})
				.on('dragenter', function(event) {
					var e = event.originalEvent;
					e.preventDefault();
					$(this).addClass('drag');
				})
				.on('dragleave', function(event) {
					$(this).removeClass('drag');
				})
				.on('drop', function(event) {
					var e = event.originalEvent;
					e.preventDefault();
					
					// make sure we didn't drop on ourselves
					if (idx == $cur.data('drag_idx')) return false;
					
					// see if we need to insert above or below target
					var above = true;
					var pos = $tr.offset();
					var height = $tr.height();
					var y = event.clientY;
					if (y > pos.top + (height / 2)) above = false;
					
					// remove element being dragged
					$cur.detach();
					
					// insert at new location
					if (above) $tr.before( $cur );
					else $tr.after( $cur );
					
					// fire callback, pass new sorted collection
					args.callback( $table.find('tr').slice(1) );
				});
		}; // createDropZone
		
		$rows.each( function(row_idx) {
			var $handle = $(this).find(args.handle_sel);
			
			$handle.on('dragstart', function(event) {
				var e = event.originalEvent;
				var $tr = $cur = $(this).closest('tr');
				var $ghost = $tr.find(args.drag_ghost_sel).addClass('dragging');
				var ghost_x = ('drag_ghost_x' in args) ? args.drag_ghost_x : Math.floor($ghost.width() / 2);
				var ghost_y = ('drag_ghost_y' in args) ? args.drag_ghost_y : Math.floor($ghost.height() / 2);
				
				e.dataTransfer.setDragImage( $ghost.get(0), ghost_x, ghost_y );
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/html', 'blah'); // needed for FF.
				
				// need to recalc $rows for each drag
				$rows = $table.find('tr').slice(1);
				
				$rows.each( function(idx) {
					var $tr = $(this);
					$tr.data('drag_idx', idx);
				});
				
				// and we need to recalc row_idx too
				var row_idx = $tr.data('drag_idx');
				
				// create drop zones for each row
				// (except those immedately surrounding the row we picked up)
				$rows.each( function(idx) {
					var $tr = $(this);
					if ((idx != row_idx) && (idx != row_idx + 1)) {
						var pos = $tr.offset();
						pos.width = $tr.width();
						pos.height = $tr.height();
						createDropZone( $tr, idx, pos );
					}
				});
				
				// one final zone below table (possibly)
				if (row_idx != $rows.length - 1) {
					var $last_tr = $rows.slice(-1);
					var pos = $last_tr.offset();
					pos.width = $last_tr.width();
					pos.height = $last_tr.height();
					pos.top += pos.height;
					createDropZone( $last_tr, $rows.length, pos );
				}
			}); // dragstart
			
			$handle.on('dragend', function(event) {
				// cleanup drop zones
				$('div.dropzone').remove();
				$rows.removeData('drag_idx');
				$table.find('.dragging').removeClass('dragging');
			}); // dragend
			
		} ); // foreach row
	},
	
	cancelDrag: function(table_sel) {
		// cancel drag operation in progress (well, as best we can)
		var $table = $(table_sel);
		if (!$table.length) return;
		
		var $rows = $table.find('tr').slice(1); // omit header row
		$('div.dropzone').remove();
		$rows.removeData('drag_idx');
		$table.find('.dragging').removeClass('dragging');
	}
	
} );
