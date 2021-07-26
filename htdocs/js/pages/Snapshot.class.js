Class.subclass( Page.Base, "Page.Snapshot", {	
	
	default_sub: 'list',
	
	onInit: function() {
		// called once at page load
		var html = '';
		this.div.html( html );
	},
	
	onActivate: function(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		if (args.id) args.sub = 'snapshot';
		if (!args.sub) args.sub = this.default_sub;
		this.args = args;
		
		app.showTabBar(true);
		this.showControls(false);
		
		this.div.addClass('loading');
		this['gosub_'+args.sub](args);
		
		return true;
	},
	
	gosub_list: function(args) {
		// show snapshot list
		app.setWindowTitle( "Snapshot List" );
		
		if (!args.offset) args.offset = 0;
		if (!args.limit) args.limit = 25;
		app.api.post( 'app/get_snapshots', copy_object(args), this.receive_snapshots.bind(this) );
	},
	
	receive_snapshots: function(resp) {
		// receive page of snapshots from server, render it
		var self = this;
		var html = '';
		this.div.removeClass('loading');
		
		this.snapshots = [];
		if (resp.rows) this.snapshots = resp.rows;
		
		var cols = ['Hostname', 'Date/Time', 'Source', 'Alerts', 'Actions'];
		
		html += '<div style="padding:20px 20px 30px 20px">';
		
		html += '<div class="subtitle">';
			html += 'Server Snapshot List';
			// html += '<div class="clear"></div>';
		html += '</div>';
		
		if (resp.rows && resp.rows.length) {
			html += this.getPaginatedTable( resp, cols, 'snapshot', function(item, idx) {
				// { date, hostname, source, alerts, time_code }
				var color = '';
				var snap_id = item.hostname + '/' + item.time_code;
				var snap_url = '#Snapshot?id=' + snap_id;
				var actions = [ '<a href="' + snap_url + '">View Snapshot</a>' ];
				var nice_source = '';
				var nice_alerts = '(None)';
				
				switch (item.source) {
					case 'alert': nice_source = '<i class="mdi mdi-bell">&nbsp;</i>Alert System'; break;
					case 'watch': nice_source = '<i class="mdi mdi-eye">&nbsp;</i>Server Watch'; break;
				}
				
				if (item.alerts && num_keys(item.alerts)) {
					nice_alerts = hash_keys_to_array(item.alerts).sort().map( function(alert_id) {
						var alert_def = find_object( config.alerts, { id: alert_id } ) || { 
							id: alert.id,
							title: '(' + alert.id + ')',
							expression: 'n/a'
						};
						return '<i class="mdi mdi-bell">&nbsp;</i>' + alert_def.title;
					}).join(', ');
				}
				
				var tds = [
					'<b>' + self.getNiceHostname( item.hostname, snap_url ) + '</b>',
					'<div style="white-space:nowrap;">' + get_nice_date_time( item.date || 0, false, false ) + '</div>',
					'<div class="td_big" style="white-space:nowrap; font-size:12px; font-weight:normal;">' +  nice_source + '</div>',
					// nice_source,
					nice_alerts,
					'<div style="white-space:nowrap;">' + actions.join(' | ') + '</div>'
				];
				if (color) tds.className = color;
				
				return tds;
			} );
		}
		else {
			html += '<fieldset class="inline_error">';
			html += '<div class="inline_error_title">No Snapshots Found</div>';
			html += '<div class="inline_error_msg">Snapshots are automatically created when an alert is triggered.<br/>You can also request snapshots on any server by starting a <i class="mdi mdi-eye">&nbsp;</i>Watch.</div>';
			html += '</fieldset>';
		}
		
		html += '</div>'; // padding
		
		this.div.html( html );
	},
	
	getNiceHostname: function(hostname, link, width) {
		// get formatted hostname with icon, plus custom link
		if (!width) width = 500;
		if (!hostname) return '(None)';
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-desktop-tower">&nbsp;</i>';
		if (link) {
			html += '<a href="' + link + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + this.formatHostname(hostname) + '</span></a>';
		}
		else {
			html += icon + this.formatHostname(hostname);
		}
		html += '</div>';
		
		return html;
	},
	
	gosub_snapshot: function(args) {
		// show specific snapshot
		var self = this;
		var args = this.args;
		
		app.setWindowTitle( "View Snapshot" );
		
		app.api.get( 'app/get_snapshot', args, this.receiveSnapshot.bind(this), function(err) {
			self.doInlineError( "Server Error", err.description );
		} );
	},
	
	jumpToHistorical: function() {
		// jump to historical view for snapshot date and hostname
		var hostname = this.metadata.hostname;
		var date = this.metadata.date;
		var dargs = get_date_args( date );
		Nav.go( '#Server?hostname=' + hostname + '&date=' + dargs.yyyy_mm_dd + '/' + dargs.hh );
	},
	
	receiveSnapshot: function(resp) {
		// render snapshot data
		var self = this;
		var args = this.args;
		this.div.removeClass('loading');
		this.metadata = resp.metadata;
		var metadata = resp.metadata;
		var snapshot = metadata.snapshot;
		var html = '';
		
		this.group = app.findGroupFromHostData( metadata );
		if (!this.group) {
			this.group = { id: "(unknown)", title: "(Unknown)" };
			// return this.doInlineError("No matching group found for server: " + this.args.hostname);
		}
		
		html += '<div class="subtitle" style="margin-top:10px; margin-bottom:15px;">';
			html += '<i class="mdi mdi-history">&nbsp;</i>Server Snapshot: ' + app.formatHostname(metadata.hostname) + " &mdash; " + get_nice_date_time( metadata.date );
			html += '<div class="subtitle_widget"><span class="link" onMouseUp="$P().jumpToHistorical()"><i class="mdi mdi-chart-line mdi-lg">&nbsp;</i><b>View Historical Graphs...</b></span></div>';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		// gather alerts from snapshot
		var all_alerts = [];
		if (metadata.alerts) {
			for (var alert_id in metadata.alerts) {
				all_alerts.push( 
					merge_objects( metadata.alerts[alert_id], { 
						id: alert_id, 
						hostname: metadata.hostname 
					} )
				);
			} // foreach alert
		} // has alerts
		
		if (all_alerts.length) {
			// build alert table
			html += '<fieldset style="margin-top:10px">';
			html += '<legend>Alerts</legend>';
			html += '<table class="fieldset_table" width="100%">';
			html += '<tr>';
				html += '<th>Alert</th>';
				html += '<th>Hostname</th>';
				html += '<th>Detail</th>';
				html += '<th>Trigger</th>';
				html += '<th>Date/Time</th>';
			html += '</tr>';
			
			all_alerts.forEach( function(alert) {
				var alert_def = find_object( config.alerts, { id: alert.id } ) || { 
					id: alert.id,
					title: '(' + alert.id + ')',
					expression: 'n/a'
				};
				html += '<tr>';
				html += '<td><b>' + self.getNiceAlert(alert_def, true) + '</b></td>';
				html += '<td>' + self.getNiceHostname(alert.hostname, false) + '</td>';
				html += '<td>' + alert.message + '</td>';
				html += '<td style="font-family:monospace">' + alert_def.expression + '</pre></td>';
				html += '<td>' + get_nice_date_time( alert.date ) + '</td>';
				html += '</tr>';
			});
			
			html += '</table>';
			html += '</fieldset>';
		}
		
		html += '<fieldset style="margin-top:10px;">';
		html += '<legend>Server Info</legend>';
		
		// flex (god help me)
		html += '<div style="display:flex; justify-content:space-between; margin:5px 10px 0px 10px;">';
		
		// column 1
		html += '<div class="snap_info_column">';
			html += '<div class="info_label">Snapshot Date/Time</div>';
			html += '<div class="info_value">' + get_nice_date_time( metadata.date ) + '</div>';
			
			html += '<div class="info_label">Hostname</div>';
			html += '<div class="info_value">' + metadata.hostname + '</div>';
			
			html += '<div class="info_label">IP Address</div>';
			html += '<div class="info_value">' + (metadata.ip || 'n/a') + '</div>';
			
			html += '<div class="info_label">Group Membership</div>';
			html += '<div class="info_value">' + this.getNiceGroup(this.group, false) + '</div>';
		html += '</div>';
		
		// column 2
		html += '<div class="snap_info_column">';
			var nice_cpu_model = 'n/a';
			if (metadata.data.cpu && metadata.data.cpu.manufacturer) {
				nice_cpu_model = metadata.data.cpu.manufacturer;
				if (metadata.data.cpu.brand) nice_cpu_model += ' ' + metadata.data.cpu.brand;
			}
			html += '<div class="info_label">CPU Type</div>';
			html += '<div class="info_value">' + nice_cpu_model + '</div>';
			
			var clock_ghz = metadata.data.cpu ? metadata.data.cpu.speed : 0;
			var nice_clock_speed = '' + clock_ghz + ' GHz';
			if (clock_ghz < 1.0) {
				nice_clock_speed = Math.floor(clock_ghz * 1000) + ' MHz';
			}
			html += '<div class="info_label">CPU Clock</div>';
			html += '<div class="info_value">' + nice_clock_speed + '</div>';
			
			var nice_cores = 'n/a';
			if (metadata.data.cpu && metadata.data.cpu.cores) {
				if (metadata.data.cpu.physicalCores && (metadata.data.cpu.physicalCores != metadata.data.cpu.cores)) {
					nice_cores = metadata.data.cpu.physicalCores + " physical, " + 
						metadata.data.cpu.cores + " virtual";
				}
				else {
					nice_cores = metadata.data.cpu.cores;
				}
			}
			html += '<div class="info_label">CPU Cores</div>';
			html += '<div class="info_value">' + nice_cores + '</div>';
			
			var nice_load = metadata.data.load.map( function(num) { return short_float_str(num); } ).join(', ');
			html += '<div class="info_label">CPU Load Averages</div>';
			html += '<div class="info_value">' + nice_load + '</div>';
		html += '</div>';
		
		// column 3
		html += '<div class="snap_info_column">';
			html += '<div class="info_label">Total RAM</div>';
			html += '<div class="info_value">' + get_text_from_bytes(metadata.data.memory.total || 0) + '</div>';
			
			html += '<div class="info_label">Memory in Use</div>';
			html += '<div class="info_value">' + get_text_from_bytes(metadata.data.memory.used || 0) + '</div>';
			
			html += '<div class="info_label">Memory Available</div>';
			html += '<div class="info_value">' + get_text_from_bytes(metadata.data.memory.available || 0) + '</div>';
			
			html += '<div class="info_label">Memory Free</div>';
			html += '<div class="info_value">' + get_text_from_bytes(metadata.data.memory.free || 0) + '</div>';
		html += '</div>';
		
		// column 4
		html += '<div class="snap_info_column">';
			var socket_states = metadata.data.stats.network.states || {};
			html += '<div class="info_label">Socket Listeners</div>';
			html += '<div class="info_value">' + commify( socket_states.listen || 0 ) + '</div>';
			
			html += '<div class="info_label">Open Connections</div>';
			html += '<div class="info_value">' + commify( socket_states.established || 0 ) + '</div>';
			
			var num_closed = 0;
			if (socket_states.close_wait) num_closed += socket_states.close_wait;
			if (socket_states.closed) num_closed += socket_states.closed;
			html += '<div class="info_label">Closed Connections</div>';
			html += '<div class="info_value">' + commify( num_closed ) + '</div>';
			
			html += '<div class="info_label">Total Processes</div>';
			html += '<div class="info_value">' + commify( metadata.data.processes.all || 0 ) + '</div>';
		html += '</div>';
		
		// column 5
		html += '<div class="snap_info_column">';
			var nice_disk = 'n/a';
			var root_mount = metadata.data.mounts.root;
			if (root_mount) {
				nice_disk = get_text_from_bytes(root_mount.used) + " of " + get_text_from_bytes(root_mount.size) + " (" + root_mount.use + "%)";
			}
			html += '<div class="info_label">Disk Usage (Root)</div>';
			html += '<div class="info_value">' + nice_disk + '</div>';
			
			var nice_os = 'n/a';
			if (metadata.data.os.distro) {
				nice_os = metadata.data.os.distro + ' ' + metadata.data.os.release; //  + ' (' + metadata.data.os.arch + ')';
			}
			html += '<div class="info_label">Operating System</div>';
			html += '<div class="info_value">' + nice_os + '</div>';
			
			var nice_kernel = 'n/a';
			var extra_server_info = config.extra_server_info;
			if (extra_server_info.source) {
				nice_kernel = substitute(extra_server_info.source, metadata.data, false);
			}
			html += '<div class="info_label">' + extra_server_info.title + '</div>';
			html += '<div class="info_value">' + nice_kernel + '</div>';
			
			html += '<div class="info_label">Server Uptime</div>';
			html += '<div id="d_server_uptime" class="info_value" style="margin-bottom:0;">' + get_text_from_seconds(metadata.data.uptime_sec || 0, false, true) + '</div>';
		html += '</div>';
		
		html += '</div>'; // flex
		html += '</fieldset>';
		
		// CPU Details
		if (metadata.data.cpu && metadata.data.cpu.cpus) {
			html += '<fieldset style="margin-top:10px;">';
			html += this.getCPUTableHTML( metadata.data.cpu.cpus );
			html += '</fieldset>';
		}
		
		// Processes
		snapshot.processes.list.forEach( function(item) {
			var epoch = ((new Date( item.started.replace(/\-/g, '/') )).getTime() || 0) / 1000;
			item.age = epoch ? Math.max(0, metadata.date - epoch) : 0;
		});
		
		var proc_opts = {
			id: 't_snap_procs',
			item_name: 'process',
			sort_by: 'pcpu',
			sort_dir: -1,
			filter: '',
			column_ids: ['pid', 'parentPid', 'user', 'pcpu', 'mem_rss', 'age', 'command'],
			column_labels: ["PID", "Parent", "User", "CPU", "Memory", "Age", "Command"]
		};
		html += '<fieldset style="margin-top:10px;">';
		html += '<legend>All Processes</legend>';
		html += '<div class="inline_table_scrollarea">';
		html += this.getSortableTable( snapshot.processes.list, proc_opts, function(item) {
			return [
				item.pid,
				item.parentPid,
				item.user,
				short_float(item.pcpu) + '%',
				'<div style="white-space:nowrap;">' + get_text_from_bytes( (item.mem_rss || 0) * 1024 ) + '</div>',
				'<div style="white-space:nowrap;">' + get_text_from_seconds( item.age || 0, false, true ) + '</div>',
				'<span style="font-family:monospace; white-space:normal; word-break:break-word;">' + item.command + '</span>'
			];
		});
		html += '</div>';
		html += '</fieldset>';
		
		// Connections
		snapshot.network.connections.forEach( function(item) {
			item.localport = parseInt( item.localport ) || 0;
			item.peerport = parseInt( item.peerport ) || 0;
		});
		var conn_opts = {
			id: 't_snap_conns',
			item_name: 'connection',
			sort_by: 'peeraddress',
			sort_dir: 1,
			filter: 'established',
			column_ids: ['protocol', 'localaddress', 'localport', 'peeraddress', 'peerport', 'state'],
			column_labels: ["Protocol", "Local Address", "Local Port", "Peer Address", "Peer Port", "State"]
		};
		html += '<fieldset style="margin-top:10px;">';
		html += '<legend>Network Connections</legend>';
		html += '<div class="inline_table_scrollarea">';
		html += this.getSortableTable( snapshot.network.connections, conn_opts, function(item) {
			return [
				item.protocol.toUpperCase(),
				item.localaddress,
				item.localport,
				item.peeraddress,
				item.peerport,
				item.state
			];
		});
		html += '</div>';
		html += '</fieldset>';
		
		// Open Files
		if (snapshot.files && snapshot.files.list && snapshot.files.list.length) {
			var files_opts = {
				id: 't_snap_files',
				item_name: 'file',
				sort_by: 'pid',
				sort_dir: 1,
				filter: '',
				column_ids: ['pid', 'type', 'desc', 'path'],
				column_labels: ["PID", "Type", "Description", "Path/Info"]
			};
			html += '<fieldset style="margin-top:10px;">';
			html += '<legend>Open Files</legend>';
			html += '<div class="inline_table_scrollarea">';
			html += this.getSortableTable( snapshot.files.list, files_opts, function(item) {
				return [
					item.pid,
					item.type,
					item.desc,
					'<span style="font-family:monospace; white-space:normal; word-break:break-word;">' + item.path + '</span>'
				];
			});
			html += '</div>';
			html += '</fieldset>';
		}
		
		// Filesystems
		var mounts = [];
		for (var key in metadata.data.mounts) {
			var mount = metadata.data.mounts[key];
			mount.avail = Math.max(0, mount.size - mount.used);
			mounts.push( mount );
		}
		var fs_opts = {
			id: 't_snap_fs',
			item_name: 'mount',
			sort_by: 'mount',
			sort_dir: 1,
			filter: '',
			column_ids: ['mount', 'type', 'fs', 'size', 'used', 'avail', 'use'],
			column_labels: ["Mount Point", "Type", "Device", "Total Size", "Used", "Available", "Use %"]
		};
		html += '<fieldset style="margin-top:10px;">';
		html += '<legend>Filesystems</legend>';
		html += '<div class="inline_table_scrollarea">';
		html += this.getSortableTable( mounts, fs_opts, function(item) {
			return [
				'<span style="font-family:monospace">' + item.mount + '</span>',
				item.type,
				item.fs,
				get_text_from_bytes( item.size ),
				get_text_from_bytes( item.used ),
				get_text_from_bytes( item.avail ),
				self.getPercentBarHTML( item.use / 100, 200 )
			];
		});
		html += '</div>';
		html += '</fieldset>';
		
		this.div.html( html );
	},
	
	getSortedTableRows: function(id) {
		// get sorted (and filtered!) table rows
		var opts = this.tables[id];
		var filter_re = new RegExp( escape_regexp(opts.filter) || '.*', 'i' );
		var sort_by = opts.sort_by;
		var sort_dir = opts.sort_dir;
		var sort_type = 'number';
		if (opts.rows.length && (typeof(opts.rows[0][sort_by]) == 'string')) sort_type = 'string';
		
		// apply filter
		var rows = opts.rows.filter( function(row) {
			var blob = hash_values_to_array(row).join(' ');
			return !!blob.match( filter_re );
		} );
		
		// apply custom sort
		rows.sort( function(a, b) {
			if (sort_type == 'number') {
				return( (a[sort_by] - b[sort_by]) * sort_dir );
			}
			else {
				return( a[sort_by].toString().localeCompare(b[sort_by]) * sort_dir );
			}
		});
		
		return rows;
	},
	
	applyTableFilter: function(elem) {
		// key typed in table filter box, redraw
		var id = $(elem).data('id');
		var opts = this.tables[id];
		opts.filter = $(elem).val();
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		// redraw pagination thing
		this.div.find('#st_hinfo_' + opts.id).html(
			this.getTableHeaderInfo(id, disp_rows) 
		);
		
		// redraw rows
		this.div.find('#st_' + opts.id + ' > tbody').html( 
			this.getTableContentHTML( opts.id, disp_rows ) 
		);
	},
	
	getTableHeaderInfo: function(id, disp_rows) {
		// construct HTML for sortable table header info widget
		var opts = this.tables[id];
		var rows = opts.rows;
		var html = '';
		
		if (disp_rows.length < rows.length) {
			html += commify(disp_rows.length) + ' of ' + commify(rows.length) + ' ' + pluralize(opts.item_name, rows.length) + '';
		}
		else {
			html += commify(rows.length) + ' ' + pluralize(opts.item_name, rows.length) + '';
		}
		
		var bold_idx = opts.column_ids.indexOf( opts.sort_by );
		html += ', sorted by ' + opts.column_labels[bold_idx] + '';
		html += ' <i class="fa fa-caret-' + ((opts.sort_dir == 1) ? 'up' : 'down') + '"></i>';
		// html += ((opts.sort_dir == 1) ? ' ascending' : ' descending');
		
		return html;
	},
	
	getTableColumnHTML: function(id) {
		// construct HTML for sortable table column headers (THs)
		var opts = this.tables[id];
		var html = '';
		html += '<tr>';
		
		opts.column_ids.forEach( function(col_id, idx) {
			var col_label = opts.column_labels[idx];
			var classes = ['st_col_header'];
			var icon = '';
			if (col_id == opts.sort_by) {
				classes.push('active');
				icon = ' <i class="fa fa-caret-' + ((opts.sort_dir == 1) ? 'up' : 'down') + '"></i>';
			}
			html += '<th class="' + classes.join(' ') + '" data-id="' + opts.id + '" data-col="' + col_id + '" onMouseUp="$P().toggleTableSort(this)">' + col_label + icon + '</th>';
		});
		
		html += '</tr>';
		return html;
	},
	
	getTableContentHTML: function(id, disp_rows) {
		// construct HTML for sortable table content (rows)
		var opts = this.tables[id];
		var html = '';
		var bold_idx = opts.column_ids.indexOf( opts.sort_by );
		
		for (var idx = 0, len = disp_rows.length; idx < len; idx++) {
			var row = disp_rows[idx];
			var tds = opts.callback(row, idx);
			html += '<tr>';
			for (var idy = 0, ley = tds.length; idy < ley; idy++) {
				html += '<td' + ((bold_idx == idy) ? ' style="font-weight:bold"' : '') + '>' + tds[idy] + '</td>';
			}
			// html += '<td>' + tds.join('</td><td>') + '</td>';
			html += '</tr>';
		} // foreach row
		
		if (!disp_rows.length) {
			html += '<tr><td colspan="' + opts.column_ids.length + '" align="center" style="padding-top:10px; padding-bottom:10px; font-weight:bold;">';
			html += 'No ' + pluralize(opts.item_name) + ' found.';
			html += '</td></tr>';
		}
		
		return html;
	},
	
	toggleTableSort: function(elem) {
		var id = $(elem).data('id');
		var col_id = $(elem).data('col');
		var opts = this.tables[id];
		
		// swap sort dir or change sort column
		if (col_id == opts.sort_by) {
			// swap dir
			opts.sort_dir *= -1;
		}
		else {
			// same sort dir but change column
			opts.sort_by = col_id;
		}
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		// redraw pagination thing
		this.div.find('#st_hinfo_' + opts.id).html(
			this.getTableHeaderInfo(id, disp_rows) 
		);
		
		// redraw columns
		this.div.find('#st_' + opts.id + ' > thead').html( 
			this.getTableColumnHTML(id) 
		);
		
		// redraw rows
		this.div.find('#st_' + opts.id + ' > tbody').html( 
			this.getTableContentHTML( opts.id, disp_rows ) 
		);
	},
	
	getSortableTable: function(rows, opts, callback) {
		// get HTML for sortable and filterable table
		var self = this;
		var html = '';
		
		// save in page for resort / filtering
		if (!this.tables) this.tables = {};
		opts.rows = rows;
		opts.callback = callback;
		this.tables[ opts.id ] = opts;
		
		var disp_rows = this.getSortedTableRows( opts.id );
		
		// pagination
		html += '<div class="pagination">';
		html += '<table cellspacing="0" cellpadding="0" border="0" width="100%"><tr>';
		
		html += '<td align="left" width="50%" id="st_hinfo_' + opts.id + '">';
		html += this.getTableHeaderInfo( opts.id, disp_rows );
		html += '</td>';
		
		/*html += '<td align="center" width="34%">';
			html += '&nbsp;';
		html += '</td>';*/
		
		html += '<td align="right" width="50%">';
			html += '<div class="sb_header_search_container" style="width:120px">';
				html += '<input type="text" class="sb_header_search" placeholder="Filter" value="' + opts.filter + '" data-id="' + opts.id + '" onKeyUp="$P().applyTableFilter(this)"/>';
				html += '<div class="sb_header_search_icon" onMouseUp="$(this).prev().focus()"><i class="fa fa-search"></i></div>';
			html += '</div>';
		html += '</td>';
		
		html += '</tr></table>';
		html += '</div>';
		
		html += '<div style="margin-top:10px;">';
		html += '<table class="fieldset_table" width="100%" id="st_' + opts.id + '">';
		
		html += '<thead>';
		html += this.getTableColumnHTML( opts.id );
		html += '</thead>';
		
		html += '<tbody>';
		html += this.getTableContentHTML( opts.id, disp_rows );
		html += '</tbody>';
		
		html += '</table>';
		html += '</div>';
		
		return html;
	},
	
	onSecond30: function(dargs) {
		// update graphs on the :30s, but only in realtime view
		var args = this.args;
		
		if (this.args.sub == 'list') {
			// refresh snapshot list every minute
			this.gosub_list(args);
		}
	},
	
	onDeactivate: function() {
		// called when page is deactivated
		// this.div.html( '' );
		return true;
	}
	
} );
