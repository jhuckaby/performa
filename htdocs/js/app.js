// Performa Web App
// Author: Joseph Huckaby
// Copyright (c) 2018 Joseph Huckaby and PixlCore.com

if (!window.app) throw new Error("App Framework is not present.");

app.extend({
	
	name: '',
	preload_images: ['loading.gif'],
	plain_text_post: false,
	default_prefs: {
		graph_size: 'half',
		ov_graph_size: 'third',
		auto_refresh: '1', // localStorage is ALWAYS STRINGS (ugh)
		annotations: '1'
	},
	debug_cats: { 
		all: 1, 
		api: false
	},
	
	receiveConfig: function(resp) {
		// receive config from server
		delete resp.code;
		window.config = resp.config;
		
		if (config.debug) {
			Debug.enable( this.debug_cats );
			Debug.trace('system', "Performa Client Starting Up");
		}
		
		this.initTheme();
		
		for (var key in resp) {
			this[key] = resp[key];
		}
		
		// allow visible app name to be changed in config
		this.name = config.name;
		$('#d_header_title').html( '<b>' + this.name + '</b>' );
		
		this.config.Page = [
			{ ID: 'Home' },
			{ ID: 'Group' },
			{ ID: 'Server' },
			{ ID: 'Snapshot' },
			{ ID: 'Login' },
			{ ID: 'MyAccount' },
			{ ID: 'Admin' }
		];
		this.config.DefaultPage = 'Home';
		
		// did we try to init and fail?  if so, try again now
		if (this.initReady) {
			this.hideProgress();
			delete this.initReady;
			this.init();
		}
	},
	
	init: function() {
		// initialize application
		if (this.abort) return; // fatal error, do not initialize app
		
		if (!this.config) {
			// must be in master server wait loop
			this.initReady = true;
			return;
		}
		
		if (!this.config.groups || !this.config.groups.length) return app.doError("FATAL: No groups defined in configuration.");
		if (!this.config.monitors || !this.config.monitors.length) return app.doError("FATAL: No monitors defined in configuration.");
		
		// preload a few essential images
		for (var idx = 0, len = this.preload_images.length; idx < len; idx++) {
			var filename = '' + this.preload_images[idx];
			var img = new Image();
			img.src = '/images/'+filename;
		}
		
		// populate prefs for first time user
		for (var key in this.default_prefs) {
			if (!(key in window.localStorage)) {
				window.localStorage[key] = this.default_prefs[key];
			}
		}
		
		// precompile regexpes
		this.hostnameStrip = new RegExp( config.hostname_display_strip );
		
		// pop version into footer
		$('#d_footer_version').html( "Version " + this.version || 0 );
		
		// some css munging for safari
		var ua = navigator.userAgent;
		if (ua.match(/Safari/) && !ua.match(/(Chrome|Opera)/)) {
			$('body').addClass('safari');
			this.safari = true;
		}
		
		// listen for events
		window.addEventListener( "scroll", debounce(this.onScrollDebounce.bind(this), 50), false );
		window.addEventListener( "focus", this.onFocus.bind(this), false );
		$('#fe_ctrl_filter').on( 'keyup', debounce(this.onFilterKeyUp.bind(this), 50) );
		
		// init controls
		this.initControlMenus();
		
		// init "jump to" menus
		this.initJumpMenus();
		
		// init page manager and launch current page
		this.page_manager = new PageManager( always_array(config.Page) );
		
		// wait for our fonts to load (because we use them in canvases)
		onfontsready(['Lato', 'LatoBold'], function() {
			if (!Nav.inited) Nav.init();
			
			// start tick timer
			app.tickTimer = setInterval( app.tick.bind(app), 1000 );
		},
		{
			timeoutAfter: 3000,
			onTimeout: function() {
				Debug.trace('error', "Fonts timed out, loading app anyway");
				if (!Nav.inited) Nav.init();
			}
		});
	},
	
	initControlMenus: function() {
		// populate control strip menus (dates, groups)
		var dargs = get_date_args( new Date() );
		if (!config.first_year) config.first_year = dargs.year;
		var first_year = config.first_year;
		var old_year = $('#fe_ctrl_year').val();
		
		$('#fe_ctrl_year').empty();
		for (var year = first_year; year <= dargs.year; year++) {
			$('#fe_ctrl_year').append( '<option value="' + year + '">' + year + '</option>' );
		}
		if (old_year) $('#fe_ctrl_year').val( old_year );
		
		var old_group = $('#fe_ctrl_group').val();
		$('#fe_ctrl_group').empty();
		
		this.config.groups.sort( function(a, b) {
			return a.id.localeCompare( b.id );
		} );
		
		this.config.groups.forEach( function(group_def) {
			$('#fe_ctrl_group').append( '<option value="' + group_def.id + '">' + group_def.title + '</option>' );
		});
		if (old_group) $('#fe_ctrl_group').val( old_group );
	},
	
	getRecentServerMenuOptionsHTML: function() {
		// get nice server list with sorted groups (and sorted servers in groups)
		var self = this;
		var menu_groups = {};
		var other_hostnames = [];
		
		// jump to server menu
		for (var hostname in this.recent_hostnames) {
			var value = this.recent_hostnames[hostname];
			if (value === 1) {
				// standard host, need to match group
				var group_def = this.findGroupFromHostname( hostname );
				if (group_def) {
					if (!menu_groups[group_def.id]) menu_groups[group_def.id] = [];
					menu_groups[group_def.id].push( hostname );
				}
				else other_hostnames.push(hostname);
			}
			else {
				// auto-scale host, has group embedded as value
				if (!menu_groups[value]) menu_groups[value] = [];
				menu_groups[value].push( hostname );
			}
		}
		
		var num_menu_groups = num_keys(menu_groups);
		var menu_html = '';
		
		hash_keys_to_array(menu_groups).sort().forEach( function(group_id, idx) {
			var group_def = find_object( config.groups, { id: group_id } );
			if (!group_def) return;
			var group_hostnames = menu_groups[group_id].sort();
			
			if (num_menu_groups > 1) {
				if (idx > 0) menu_html += '<option value="" disabled></option>';
				menu_html += '<optgroup label="' + group_def.title + '">';
			}
			menu_html += group_hostnames.map( function(hostname) {
				return '<option value="' + hostname + '">' + self.formatHostname(hostname) + '</option>';
			} ).join('');
			if (num_menu_groups > 1) {
				menu_html += '</optgroup>';
			}
		});
		
		if (other_hostnames.length) {
			if (num_menu_groups > 1) {
				menu_html += '<option value="" disabled></option>';
				menu_html += '<optgroup label="(Unassigned)">';
			}
			menu_html += other_hostnames.map( function(hostname) {
				return '<option value="' + hostname + '">' + self.formatHostname(hostname) + '</option>';
			} ).join('');
			if (num_menu_groups > 1) {
				menu_html += '</optgroup>';
			}
		}
		
		return menu_html;
	},
	
	initJumpMenus: function() {
		// populate tab bar "jump to" menus with servers, groups
		var self = this;
		
		var menu_html = '';
		menu_html += '<option value="" disabled>Jump to Server</option>';
		var temp_html = this.getRecentServerMenuOptionsHTML();
		if (temp_html.match(/<optgroup/)) menu_html += '<option value="" disabled></option>';
		menu_html += temp_html;
		$('#fe_jump_to_server').empty().append( menu_html ).val('');
		
		// jump to group menu
		$('#fe_jump_to_group').empty().append(
			'<option value="" disabled>Jump to Group</option>'
		);
		
		this.config.groups.sort( function(a, b) {
			return a.id.localeCompare( b.id );
		} );
		
		this.config.groups.forEach( function(group_def) {
			$('#fe_jump_to_group').append( '<option value="' + group_def.id + '">' + group_def.title + '</option>' );
		});
		$('#fe_jump_to_group').val('');
	},
	
	updateRecentHostnames: function(hostnames) {
		// merge in hostnames (presumably from api/app/contrib) into recent list
		// if any additions came in, redraw jump menu
		var need_redraw = false;
		
		for (var hostname in hostnames) {
			if (!(hostname in this.recent_hostnames)) {
				this.recent_hostnames[hostname] = hostnames[hostname];
				need_redraw = true;
			}
		}
		
		if (need_redraw) this.initJumpMenus();
	},
	
	updateHeaderInfo: function() {
		// update top-right display
		var theme_ctrl = (app.getPref('theme') == 'dark') ? 
			'<i class="fa fa-moon-o fa-lg">&nbsp;</i>Dark' : 
			'<i class="fa fa-lightbulb-o fa-lg">&nbsp;</i>Light';
		
		var alert_ctrl = (config.state.alert_snooze && (config.state.alert_snooze > time_now())) ? 
			'<i class="mdi mdi-bell-off mdi-lg">&nbsp;</i>Snooze' : 
			'<i class="mdi mdi-bell mdi-lg">&nbsp;</i>Active';
		
		var html = '';
		html += '<div class="header_divider right" style="margin-right:0;"></div>';
		html += '<div class="header_option logout right" onMouseUp="app.doUserLogout()"><i class="fa fa-power-off fa-lg">&nbsp;</i>Logout</div>';
		html += '<div class="header_divider right"></div>';
		html += '<div id="d_theme_ctrl" class="header_option right" onMouseUp="app.toggleTheme()" title="Toggle Light/Dark Theme">' + theme_ctrl + '</div>';
		if (this.isAdmin()) {
			html += '<div class="header_divider right"></div>';
			html += '<div id="d_alert_ctrl" class="header_option right" onMouseUp="app.editAlertSnooze()" title="Alert Snooze...">' + alert_ctrl + '</div>';
		}
		html += '<div class="header_divider right"></div>';
		html += '<div id="d_header_user_bar" class="right" style="background-image:url(' + this.getUserAvatarURL( this.retina ? 64 : 32 ) + ')" onMouseUp="app.doMyAccount()">' + (this.user.full_name || this.username).replace(/\s+.+$/, '') + '</div>';
		$('#d_header_user_container').html( html );
	},
	
	getTimeMenuItem: function(secs) {
		// get nice time menu item given seconds
		return [ secs, get_text_from_seconds(secs, false, true) ];
	},
	
	editAlertSnooze: function() {
		// snooze alerts, or cancel snooze
		var self = this;
		var html = '';
		var snooze_sel = 0;
		var dialog_icon = '';
		
		var snooze_items = [
			[0, "(Disable Snooze)"],
			this.getTimeMenuItem( 60 * 5 ),
			this.getTimeMenuItem( 60 * 10 ),
			this.getTimeMenuItem( 60 * 15 ),
			this.getTimeMenuItem( 60 * 30 ),
			this.getTimeMenuItem( 60 * 45 ),
			this.getTimeMenuItem( 3600 ),
			this.getTimeMenuItem( 3600 * 2 ),
			this.getTimeMenuItem( 3600 * 3 ),
			this.getTimeMenuItem( 3600 * 6 ),
			this.getTimeMenuItem( 3600 * 12 ),
			this.getTimeMenuItem( 3600 * 18 ),
			this.getTimeMenuItem( 86400 ),
			this.getTimeMenuItem( 86400 * 2 ),
			this.getTimeMenuItem( 86400 * 3 ),
			this.getTimeMenuItem( 86400 * 7 ),
			this.getTimeMenuItem( 86400 * 15 ),
			this.getTimeMenuItem( 86400 * 30 ),
			this.getTimeMenuItem( 86400 * 30 * 2 ),
			this.getTimeMenuItem( 86400 * 30 * 3 ),
			this.getTimeMenuItem( 86400 * 30 * 6 ),
			this.getTimeMenuItem( 86400 * 365 )
		];
		
		if (config.state.alert_snooze && (config.state.alert_snooze > time_now())) {
			// snooze is currently enabled
			html += '<div style="font-size:12px; margin-bottom:20px;">Alerts are currently <b>snoozed</b>, and will be until <b>' + get_nice_date_time(config.state.alert_snooze, false, false) + '</b> (approximately ' + get_text_from_seconds(config.state.alert_snooze - time_now(), false, true) + ' from now).  Use the menu below to reset the snooze timer, or cancel it and reactivate all alerts.</div>';
			snooze_sel = 0;
			dialog_icon = 'mdi mdi-bell-off';
		}
		else {
			// snooze is disabled
			html += '<div style="font-size:12px; margin-bottom:20px;">Alerts are currently <b>active</b>.  Use the menu below to optionally set a snooze timer, which will disable alert notifications for a specific amount of time.</div>';
			snooze_sel = 3600;
			dialog_icon = 'mdi mdi-bell';
		}
		
		html += '<center><table>' + 
			// get_form_table_spacer() + 
			get_form_table_row('Snooze For:', '<select id="fe_alert_snooze">' + render_menu_options(snooze_items, snooze_sel) + '</select>') + 
			get_form_table_caption("Select the amount of time to snooze alerts for.") + 
		'</table></center>';
		
		app.confirm( '<i class="' + dialog_icon + '">&nbsp;</i>Alert Snooze', html, "Set Snooze", function(result) {
			app.clearError();
			
			if (result) {
				var alert_snooze = parseInt( $('#fe_alert_snooze').val() );
				config.state.alert_snooze = alert_snooze;
				if (alert_snooze) config.state.alert_snooze += time_now(); // future date to wake up at
				var new_state = { alert_snooze: config.state.alert_snooze };
				Dialog.hide();
				
				app.api.post( 'app/update_state', new_state, function(resp) {
					
					if (alert_snooze) {
						app.showMessage('success', "Alerts will be snoozed for " + get_text_from_seconds(alert_snooze, false, true) + ".");
						$('#d_alert_ctrl').html( '<i class="mdi mdi-bell-off mdi-lg">&nbsp;</i>Snooze' );
					}
					else {
						app.showMessage('success', "Alerts have been reactivated.");
						$('#d_alert_ctrl').html( '<i class="mdi mdi-bell mdi-lg">&nbsp;</i>Active' );
					}
					
				} ); // api.post
				
			} // user clicked set
		} ); // app.confirm
	},
	
	formatHostname: function(hostname) {
		// format hostname for display
		return hostname.replace( this.hostnameStrip, '' );
	},
	
	doUserLogin: function(resp) {
		// user login, called from login page, or session recover
		// overriding this from base.js, so we can pass the session ID to the websocket
		delete resp.code;
		
		for (var key in resp) {
			this[key] = resp[key];
		}
		
		this.setPref('username', resp.username);
		this.setPref('session_id', resp.session_id);
		
		this.updateHeaderInfo();
		
		// show admin tab if user is worthy
		if (this.isAdmin()) $('#tab_Admin').show();
		else $('#tab_Admin').hide();
	},
	
	doUserLogout: function(bad_cookie) {
		// log user out and redirect to login screen
		var self = this;
		
		if (!bad_cookie) {
			// user explicitly logging out
			this.showProgress(1.0, "Logging out...");
			this.setPref('username', '');
		}
		
		this.api.post( 'user/logout', {
			session_id: this.getPref('session_id')
		}, 
		function(resp, tx) {
			delete self.user;
			delete self.username;
			delete self.user_info;
			
			self.setPref('session_id', '');
			
			$('#d_header_user_container').html( '' );
			
			if (app.config.external_users) {
				// external user api
				Debug.trace("User session cookie was deleted, querying external user API");
				setTimeout( function() {
					if (bad_cookie) app.doExternalLogin(); 
					else app.doExternalLogout(); 
				}, 250 );
			}
			else {
				Debug.trace("User session cookie was deleted, redirecting to login page");
				self.hideProgress();
				Nav.go('Login');
			}
			
			setTimeout( function() {
				if (!app.config.external_users) {
					if (bad_cookie) self.showMessage('error', "Your session has expired.  Please log in again.");
					else self.showMessage('success', "You were logged out successfully.");
				}
				
				delete self.plugins;
				delete self.epoch;
				
			}, 150 );
			
			$('#tab_Admin').hide();
		} );
	},
	
	doExternalLogin: function() {
		// login using external user management system
		// Force API to hit current page hostname vs. master server, so login redirect URL reflects it
		app.api.post( '/api/user/external_login', { cookie: document.cookie }, function(resp) {
			if (resp.user) {
				Debug.trace("User Session Resume: " + resp.username + ": " + resp.session_id);
				app.hideProgress();
				app.doUserLogin( resp );
				Nav.refresh();
			}
			else if (resp.location) {
				Debug.trace("External User API requires redirect");
				app.showProgress(1.0, "Logging in...");
				setTimeout( function() { window.location = resp.location; }, 250 );
			}
			else app.doError(resp.description || "Unknown login error.");
		} );
	},
	
	doExternalLogout: function() {
		// redirect to external user management system for logout
		var url = app.config.external_user_api;
		url += (url.match(/\?/) ? '&' : '?') + 'logout=1';
		
		Debug.trace("External User API requires redirect");
		app.showProgress(1.0, "Logging out...");
		setTimeout( function() { window.location = url; }, 250 );
	},
	
	get_password_toggle_html: function() {
		// get html for a password toggle control
		return '<span class="link password_toggle" onMouseUp="app.toggle_password_field(this)">Hide</span>';
	},
	
	toggle_password_field: function(span) {
		// toggle password field visible / masked
		var $span = $(span);
		var $field = $span.prev();
		if ($field.attr('type') == 'password') {
			$field.attr('type', 'text');
			$span.html( 'Hide' );
		}
		else {
			$field.attr('type', 'password');
			$span.html( 'Show' );
		}
	},
	
	tick: function() {
		// fired every second from web worker
		var dargs = get_date_args(time_now());
		
		// pages may define a "tick" method
		if (app.page_manager && app.page_manager.current_page_id) {
			var page = app.page_manager.find(app.page_manager.current_page_id);
			if (page && page.tick) page.tick(dargs);
		}
		
		// allow page to listen for minute events
		if (dargs.sec == 0) {
			if (app.page_manager && app.page_manager.current_page_id) {
				var page = app.page_manager.find(app.page_manager.current_page_id);
				if (page && page.onMinute) page.onMinute(dargs);
			}
		}
		
		// allow page to listen for 30s events
		if (dargs.sec == 30) {
			if (app.page_manager && app.page_manager.current_page_id) {
				var page = app.page_manager.find(app.page_manager.current_page_id);
				if (page && page.onSecond30) page.onSecond30(dargs);
			}
		}
	},
	
	findMonitorsFromGroup: function(group) {
		// find all monitors that match group
		// but only if enabled for display
		if (typeof(group) == 'string') group = find_object( config.groups, { id: group } );
		if (!group) return [];
		var monitor_defs = [];
		
		for (var idx = 0, len = config.monitors.length; idx < len; idx++) {
			var monitor_def = config.monitors[idx];
			if (monitor_def.display && group.id.match(monitor_def.group_match)) monitor_defs.push(monitor_def);
		}
		
		// sort by sort_order
		return monitor_defs.sort( function(a, b) {
			return (a.sort_order < b.sort_order) ? -1 : 1;
		} );
	},
	
	findGroupFromHostData: function(metadata) {
		// find group by host metadata (host may define its own group) or by matching hostname
		if (metadata.group) return find_object( config.groups, { id: metadata.group } );
		return this.findGroupFromHostname( metadata.hostname );
	},
	
	findGroupFromHostname: function(hostname) {
		// find group by matching hostname
		for (var idx = 0, len = config.groups.length; idx < len; idx++) {
			var group_def = config.groups[idx];
			if (hostname.match(group_def.hostname_match)) return group_def;
		}
		return false;
	},
	
	customConfirm: function(title, html, ok_btn_label, callback) {
		// show simple OK / Cancel dialog with custom text
		// fires callback with true (OK) or false (Cancel)
		// the only difference between customConfirm and base confirm is this one allows for wider-than-450px dialogs
		if (!ok_btn_label) ok_btn_label = "OK";
		this.confirm_callback = callback;
		
		var inner_html = "";
		inner_html += '<div class="custom_confirm_container">'+html+'</div>';
		
		var buttons_html = "";
		buttons_html += '<center><table><tr>';
			buttons_html += '<td><div class="button" style="width:100px; font-weight:normal;" onMouseUp="app.confirm_click(false)">Cancel</div></td>';
			buttons_html += '<td width="60">&nbsp;</td>';
			buttons_html += '<td><div class="button" style="width:100px;" onMouseUp="app.confirm_click(true)">'+ok_btn_label+'</div></td>';
		buttons_html += '</tr></table></center>';
		
		this.showDialog( title, inner_html, buttons_html );
		
		// special mode for key capture
		Dialog.active = 'confirmation';
	},
	
	onFilterKeyUp: function() {
		// called for each keyup in graph filter text input (debounced to 50ms)
		if (app.page_manager && app.page_manager.current_page_id) {
			var page = app.page_manager.find(app.page_manager.current_page_id);
			if (page && page.onFilterKeyUp) page.onFilterKeyUp();
		}
	},
	
	onScrollDebounce: function() {
		// called every 50ms while scrolling
		if (app.page_manager && app.page_manager.current_page_id) {
			var page = app.page_manager.find(app.page_manager.current_page_id);
			if (page && page.onScrollDebounce) page.onScrollDebounce();
		}
	},
	
	onFocus: function() {
		// window received focus
		if (app.page_manager && app.page_manager.current_page_id) {
			var page = app.page_manager.find(app.page_manager.current_page_id);
			if (page && page.onFocus) page.onFocus();
		}
	},
	
	onThemeChange: function(theme) {
		// called when user changes theme (and on init)
		if (app.page_manager && app.page_manager.current_page_id) {
			var page = app.page_manager.find(app.page_manager.current_page_id);
			if (page && page.onThemeChange) page.onThemeChange(theme);
		}
	}
	
}); // app

window.Debug = {
	
	enabled: false,
	categories: { all: 1 },
	backlog: [],
	
	colors: ["#001F3F", "#0074D9", "#7FDBFF", "#39CCCC", "#3D9970", "#2ECC40", "#01FF70", "#FFDC00", "#FF851B", "#FF4136", "#F012BE", "#B10DC9", "#85144B"],
	nextColorIdx: 0,
	catColors: {},
	
	enable: function(cats) {
		// enable debug logging and flush backlog if applicable
		if (cats) this.categories = cats;
		this.enabled = true;
		this._dump();
	},
	
	disable: function() {
		// disable debug logging, but keep backlog
		this.enabled = false;
	},
	
	trace: function(cat, msg, data) {
		// trace one line to console, or store in backlog
		// allow msg, cat + msg, msg + data, or cat + msg + data
		if (arguments.length == 1) {
			msg = cat; 
			cat = 'debug'; 
		}
		else if ((arguments.length == 2) && (typeof(arguments[arguments.length - 1]) == 'object')) {
			data = msg;
			msg = cat;
			cat = 'debug';
		}
		
		var now = new Date();
		var timestamp = '' + 
			this._zeroPad( now.getHours(), 2 ) + ':' + 
			this._zeroPad( now.getMinutes(), 2 ) + ':' + 
			this._zeroPad( now.getSeconds(), 2 ) + '.' + 
			this._zeroPad( now.getMilliseconds(), 3 );
		
		if (data && (typeof(data) == 'object')) data = JSON.stringify(data);
		if (!data) data = false;
		
		if (this.enabled) {
			if ((this.categories.all || this.categories[cat]) && (this.categories[cat] !== false)) {
				this._print(timestamp, cat, msg, data);
			}
		}
		else {
			this.backlog.push([ timestamp, cat, msg, data ]);
			if (this.backlog.length > 1000) this.backlog.shift();
		}
	},
	
	_dump: function() {
		// dump backlog to console
		for (var idx = 0, len = this.backlog.length; idx < len; idx++) {
			this._print.apply( this, this.backlog[idx] );
		}
		this.backlog = [];
	},
	
	_print: function(timestamp, cat, msg, data) {
		// format and print one message to the console
		var color = this.catColors[cat] || '';
		if (!color) {
			color = this.catColors[cat] = this.colors[this.nextColorIdx];
			this.nextColorIdx = (this.nextColorIdx + 1) % this.colors.length;
		}
		
		console.log( timestamp + ' %c[' + cat + ']%c ' + msg, 'color:' + color + '; font-weight:bold', 'color:inherit; font-weight:normal' );
		if (data) console.log(data);
	},
	
	_zeroPad: function(value, len) {
		// Pad a number with zeroes to achieve a desired total length (max 10)
		return ('0000000000' + value).slice(0 - len);
	}
};

function short_float_str(num) {
	// force a float (add suffix if int)
	num = '' + short_float(num);
	if (num.match(/^\-?\d+$/)) num += ".0";
	return num;
};

// Debounce Function Generator
// Fires once immediately, then never again until freq ms
function debounce(func, freq) {
	var timeout = null;
	var requestFire = false;
	
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (requestFire) {
				func.apply(context, args);
				requestFire = false;
			}
		};
		if (!timeout) {
			func.apply(context, args);
			timeout = setTimeout(later, freq);
			requestFire = false;
		}
		else {
			requestFire = true;
		}
	};
};

// Copy text to clipboard
// borrowed from: https://github.com/feross/clipboard-copy (MIT License)
function copyToClipboard(text) {
	// Put the text to copy into a <span>
	var span = document.createElement('span');
	span.textContent = text;
	
	// Preserve consecutive spaces and newlines
	span.style.whiteSpace = 'pre';
	
	// Add the <span> to the page
	document.body.appendChild(span);
	
	// Make a selection object representing the range of text selected by the user
	var selection = window.getSelection();
	var range = window.document.createRange();
	selection.removeAllRanges();
	range.selectNode(span);
	selection.addRange(range);
	
	// Copy text to the clipboard
	var success = false;
	try {
		success = window.document.execCommand('copy');
	} 
	catch (err) {
		console.log('error', err);
	}
	
	// Cleanup
	selection.removeAllRanges();
	window.document.body.removeChild(span);
};

// ----------------------------------------------
// https://github.com/teamdf/jquery-visible
(function($){
	/**
	 * Copyright 2012, Digital Fusion
	 * Licensed under the MIT license.
	 * http://teamdf.com/jquery-plugins/license/
	 *
	 * @author Sam Sehnert
	 * @desc A small plugin that checks whether elements are within
	 *	   the user visible viewport of a web browser.
	 *	   only accounts for vertical position, not horizontal.
	 */
	var $w = $(window);
	$.fn.visible = function(partial,hidden,direction){

		if (this.length < 1)
			return;

		var $t		= this.length > 1 ? this.eq(0) : this,
			t		 = $t.get(0),
			vpWidth   = $w.width(),
			vpHeight  = $w.height(),
			direction = (direction) ? direction : 'both',
			clientSize = hidden === true ? t.offsetWidth * t.offsetHeight : true;

		if (typeof t.getBoundingClientRect === 'function'){

			// Use this native browser method, if available.
			var rec = t.getBoundingClientRect(),
				tViz = rec.top	>= 0 && rec.top	<  vpHeight,
				bViz = rec.bottom >  0 && rec.bottom <= vpHeight,
				lViz = rec.left   >= 0 && rec.left   <  vpWidth,
				rViz = rec.right  >  0 && rec.right  <= vpWidth,
				vVisible   = partial ? tViz || bViz : tViz && bViz,
				hVisible   = partial ? lViz || rViz : lViz && rViz;

			if(direction === 'both')
				return clientSize && vVisible && hVisible;
			else if(direction === 'vertical')
				return clientSize && vVisible;
			else if(direction === 'horizontal')
				return clientSize && hVisible;
		} else {

			var viewTop		 = $w.scrollTop(),
				viewBottom	  = viewTop + vpHeight,
				viewLeft		= $w.scrollLeft(),
				viewRight	   = viewLeft + vpWidth,
				offset		  = $t.offset(),
				_top			= offset.top,
				_bottom		 = _top + $t.height(),
				_left		   = offset.left,
				_right		  = _left + $t.width(),
				compareTop	  = partial === true ? _bottom : _top,
				compareBottom   = partial === true ? _top : _bottom,
				compareLeft	 = partial === true ? _right : _left,
				compareRight	= partial === true ? _left : _right;

			if(direction === 'both')
				return !!clientSize && ((compareBottom <= viewBottom) && (compareTop >= viewTop)) && ((compareRight <= viewRight) && (compareLeft >= viewLeft));
			else if(direction === 'vertical')
				return !!clientSize && ((compareBottom <= viewBottom) && (compareTop >= viewTop));
			else if(direction === 'horizontal')
				return !!clientSize && ((compareRight <= viewRight) && (compareLeft >= viewLeft));
		}
	};

})(jQuery);

// onFontReady v1.1.0 (MIT License)
// https://github.com/dwighthouse/onfontready/blob/master/LICENSE
window.onfontready=function(e,t,i,n,o){i=i||0,i.timeoutAfter&&setTimeout(function(){n&&(document.body.removeChild(n),n=0,i.onTimeout&&i.onTimeout())},i.timeoutAfter),o=function(){n&&n.firstChild.clientWidth==n.lastChild.clientWidth&&(document.body.removeChild(n),n=0,t())},o(document.body.appendChild(n=document.createElement("div")).innerHTML='<div style="position:fixed;white-space:pre;bottom:999%;right:999%;font:999px '+(i.generic?"":"'")+e+(i.generic?"":"'")+',serif">'+(i.sampleText||" ")+'</div><div style="position:fixed;white-space:pre;bottom:999%;right:999%;font:999px '+(i.generic?"":"'")+e+(i.generic?"":"'")+',monospace">'+(i.sampleText||" ")+"</div>"),n&&(n.firstChild.appendChild(e=document.createElement("iframe")).style.width="999%",e.contentWindow.onresize=o,n.lastChild.appendChild(e=document.createElement("iframe")).style.width="999%",e.contentWindow.onresize=o,e=setTimeout(o))};
window.onfontsready=function(e,t,n,o,i){for(n=n||0,o=i=0;o<e.length;o++)window.onfontready(e[o],function(){++i>=e.length&&t()},{timeoutAfter:n.timeoutAfter,sampleText:n.sampleText instanceof Array?n.sampleText[o]:n.sampleText,generic:n.generic instanceof Array?n.generic[o]:n.generic});n.timeoutAfter&&n.onTimeout&&setTimeout(function(){i<e.length&&n.onTimeout(i=NaN)},n.timeoutAfter)};
