Class.subclass( Page.Base, "Page.Home", {	
	
	onInit: function() {
		// called once at page load
		var html = '';
		this.div.html( html );
	},
	
	onActivate: function(args) {
		// page activation
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		this.args = args;
		
		if (!args.length) {
			// default to last hour
			args.offset = -60;
			args.length = 60;
		}
		
		app.setWindowTitle('Overview');
		app.showTabBar(true);
		this.showControls(true);
		
		// data range (will be filled in later)
		$('#d_ctrl_range').show().find('.info_value').html('');
		
		if (this.div.is(':empty')) {
			this.div.addClass('loading');
		}
		
		this.groups = null;
		this.graphs = null;
		this.requestData();
		return true;
	},
	
	requestData: function() {
		// request data for this view
		var self = this;
		var args = this.args;
		
		app.api.get( 'app/overview', args, this.receiveData.bind(this), function(err) {
			if (err.code == "no_data") self.doInlineError( "No Data Found", "No data was found in the specified time range." );
			else self.doInlineError( "Server Error", err.description );
		} );
	},
	
	receiveData: function(data) {
		// receive view data from server
		// data: { code, rows, alerts }
		var self = this;
		var args = this.args;
		this.div.removeClass('loading');
		this.rows = data.rows;
		this.alerts = data.alerts;
		
		if (!this.rows.length) {
			return this.doInlineError('No Data Found', 'No data was found in the specified time range.');
		}
		
		// figure out which groups we actually have data for
		this.groups = [];
		var all_groups = {};
		var group_server_ranges = {};
		
		this.rows.forEach( function(row) {
			if (row.groups) {
				for (var group_id in row.groups) {
					all_groups[group_id] = 1;
					
					var count = row.groups[group_id].count || 0;
					if (count) {
						if (!(group_id in group_server_ranges)) {
							group_server_ranges[group_id] = { max: 0, min: 999999 };
						}
						if (count > group_server_ranges[group_id].max) group_server_ranges[group_id].max = count;
						if (count < group_server_ranges[group_id].min) group_server_ranges[group_id].min = count;
					}
				}
			}
		});
		if (!num_keys(all_groups)) {
			return this.doInlineError('No Data Found', 'No data was found in the specified time range.');
		}
		for (var group_id in all_groups) {
			var group_def = find_object( config.groups, { id: group_id } );
			if (group_def) this.groups.push( group_def );
		}
		this.groups.sort( function(a, b) {
			return (a.sort_order < b.sort_order) ? -1 : 1;
		} );
		
		// build HTML for page
		var html = '';
		
		// insert alerts and server info here
		// (will be populated later)
		html += '<fieldset id="fs_overview_alerts" style="margin-top:10px; display:none"></fieldset>';
		
		// for when all graphs are filtered out:
		html += '<fieldset class="inline_error" id="fs_all_filtered" style="display:none">';
		html += '<div class="inline_error_title">All Graphs Filtered</div>';
		html += '<div class="inline_error_msg">Please enter a different filter query.</div>';
		html += '</fieldset>';
		
		// render special fieldset for each group
		// in custom sort order
		this.groups.forEach( function(group_def) {
			var monitors = app.findMonitorsFromGroup( group_def );
			if (!monitors.length) return;
			
			html += '<fieldset class="overview_group">';
			html += '<legend>' + self.getNiceGroup(group_def);
			if (group_server_ranges[group_def.id].max) {
				html += '<span class="ov_group_legend_count">(';
				if (group_server_ranges[group_def.id].min != group_server_ranges[group_def.id].max) {
					// server counts varied across range
					html += commify(group_server_ranges[group_def.id].min) + ' - ' + 
						+ commify(group_server_ranges[group_def.id].max) + ' servers';
				}
				else {
					// consistent number of servers across range
					html += commify(group_server_ranges[group_def.id].min) + ' ' + 
						pluralize('server', group_server_ranges[group_def.id].min);
				}
				html += ')</span>';
			}
			html += '</legend>';
			
			// now insert empty graphs for each monitor in group
			html += '<div class="graphs overview size_' + app.getPref('ov_graph_size') + '">';
			
			// graph placeholders
			monitors.forEach( function(mon_def) {
				if (!mon_def.merge_type) return;
				var combo_id = group_def.id + '_' + mon_def.id;
				html += '<div id="d_graph_ov_' + combo_id + '" class="graph_container" data-group="' + group_def.id + '" data-mon="' + mon_def.id + '" style="min-height:200px;">'; // hack
				html += '<div class="graph_button copy"><i class="mdi mdi-clipboard-pulse-outline mdi-lg" title="Copy Graph Image URL" onMouseUp="$P().copyGraphImage(this)"></i></div>';
				html += '<div id="c_graph_ov_' + combo_id + '"></div>';
				html += '</div>';
			}); // foreach monitor
			
			html += '<div class="clear"></div>';
			html += '</div>';
			
			html += '</fieldset>';
		}); // foreach group
		
		this.div.html(html);
		
		// create all graphs without data
		this.graphs = {};
		
		/*
		this.groups.forEach( function(group_def) {
			var monitors = app.findMonitorsFromGroup( group_def );
			if (!monitors.length) return;
			
			monitors.forEach( function(mon_def, idx) {
				if (!mon_def.merge_type) return;
				var combo_id = group_def.id + '_' + mon_def.id;
				
				self.graphs[combo_id] = self.createGraph({
					id: combo_id,
					title: ucfirst(mon_def.merge_type) + " " + mon_def.title,
					data_type: mon_def.data_type,
					merge_type: mon_def.merge_type,
					suffix: mon_def.suffix || '',
					num_layers: 1,
					canvas_id: 'c_graph_ov_' + combo_id,
					color: self.graphColors[ idx % self.graphColors.length ]
				});
			}); // foreach monitor
		}); // foreach group
		*/
		
		// calculate min/max for data bounds
		this.calcDataRange();
		
		// update and render data range display in control strip
		this.updateDataRangeDisplay();
		
		// apply filters if any
		this.applyMonitorFilter(true);
		
		// trigger visible graph redraw (also happens on debounced scroll)
		this.div.find('div.graph_container').addClass('dirty');
		this.onScrollDebounce();
		this.updateInfo();
	},
	
	calcDataRange: function() {
		// calculate min/max for data bounds
		var args = this.args;
		var now_minute = Math.floor( time_now() / 60 ) * 60;
		this.range_min = (now_minute + (args.offset * 60)) * 1000;
		this.range_max = (now_minute + (args.offset * 60) + (args.length * 60)) * 1000;
	},
	
	isRowInRange: function(row) {
		// calculate if row.date is within our range bounds
		if (this.range_min && (row.date < this.range_min / 1000)) return false;
		if (this.range_max && (row.date > this.range_max / 1000)) return false;
		return true;
	},
	
	updateDataRangeDisplay: function() {
		// scan current dataset for min/max epoch and render data range in control strip
		var self = this;
		var min_date = 0;
		var max_date = 0;
		
		this.rows.forEach( function(row) {
			if (self.isRowInRange(row)) {
				if (!min_date || (row.date < min_date)) min_date = row.date;
				if (!max_date || (row.date > max_date)) max_date = row.date;
			}
		});
		
		// display data range
		this.displayDataRange( min_date, max_date );
	},
	
	updateGraph: function(group_id, mon_id) {
		// update single graph
		// called on dequeue
		var self = this;
		var combo_id = group_id + '_' + mon_id;
		var graph = this.graphs[combo_id];
		var graph_rows = [];
		
		// see if graph is still visible (queue delay -- user could have scrolled past)
		if (!this.div.find('#d_graph_ov_' + combo_id).visible(true, true)) {
			this.div.find('#d_graph_ov_' + combo_id).addClass('dirty');
			return;
		}
		
		// var group_def = find_object( config.groups, { id: group_id } );
		var mon_def = find_object( config.monitors, { id: mon_id } );
		
		if (!graph) {
			// first time graph scrolled into view, so create it
			var mon_idx = find_object_idx( config.monitors, { id: mon_id } );
			graph = this.graphs[combo_id] = self.createGraph({
				id: combo_id,
				title: ucfirst(mon_def.merge_type) + " " + mon_def.title,
				data_type: mon_def.data_type,
				merge_type: mon_def.merge_type,
				suffix: mon_def.suffix || '',
				num_layers: 1,
				canvas_id: 'c_graph_ov_' + combo_id,
				color: this.graphColors[ mon_idx % this.graphColors.length ]
			});
		}
		
		// process each row
		this.rows.forEach( function(row) {
			var group = row.groups ? row.groups[group_id] : null;
			if (group && group.totals && (mon_id in group.totals) && self.isRowInRange(row)) {
				var value = group.totals[mon_id];
				if (mon_def.merge_type == 'avg') value /= group.count || 1;
				graph_rows.push({ x: row.date * 1000, y: value });
			} // in range
		});
		
		// setup chart series
		var series = [{
			name: ucfirst( mon_def.merge_type.replace(/avg/, 'average') ),
			data: self.crushData( graph_rows )
		}];
		
		// redraw graph series and annos
		var options = this.getGraphConfig(combo_id);
		options.series = series;
		graph.updateOptions(options, true, false);
	},
	
	onScrollDebounce: function(instant) {
		// called for redraw, and for scroll (debounced)
		// find all graphs which are dirty AND visible, and update them
		var self = this;
		
		this.div.find('div.graph_container.dirty').each( function() {
			var $this = $(this);
			if (!$this.hasClass('filtered') && $this.visible(true, true)) {
				var group_id = $this.data('group');
				var mon_id = $this.data('mon');
				var combo_id = group_id + '_' + mon_id;
				Debug.trace('graph', "Rendering graph for scroll event: " + combo_id );
				$this.removeClass('dirty');
				
				// reset copy icon, just in case
				$this.find('div.graph_button.copy > i').removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
				
				if (instant) self.updateGraph(group_id, mon_id);
				else self.enqueue( self.updateGraph.bind(self, group_id, mon_id), combo_id );
			}
		});
	},
	
	onSecond30: function(dargs) {
		// update graphs on the :30s, but only in realtime view
		var args = this.args;
		
		if (this.isRealTime() && (app.getPref('auto_refresh') == '1')) {
			// special case: if we are in an error state, perform a full refresh
			if (!this.graphs) return this.requestData();
			
			var temp_args = copy_object(args);
			temp_args.offset = -1;
			temp_args.length = 1;
			Debug.trace("Requesting graph update on the 30s");
			
			app.api.get( 'app/overview', temp_args, this.receiveUpdate.bind(this), function(err) {
				app.doError( "Server Error: " + err.description );
			} );
		}
	},
	
	onFocus: function() {
		// window received focus, update data
		var args = this.args;
		
		if (this.isRealTime() && (app.getPref('auto_refresh') == '1')) {
			// special case: if we are in an error state, perform a full refresh
			if (!this.graphs) return this.requestData();
			
			Debug.trace("Requesting graph update for focus");
			
			app.api.get( 'app/overview', args, this.receiveUpdate.bind(this), function(err) {
				app.doError( "Server Error: " + err.description );
			} );
		}
	},
	
	receiveUpdate: function(data) {
		// receive update from server
		// data: { code, rows, alerts }
		var self = this;
		var rows = data.rows;
		var args = this.args;
		
		this.alerts = data.alerts;
		
		if (!rows.length) {
			Debug.trace("No rows found in update, skipping");
			return;
		}
		
		// skip dupes
		var new_rows = [];
		rows.forEach( function(row) {
			if (!find_object(self.rows, { date: row.date })) new_rows.push(row);
		});
		rows = new_rows;
		
		if (!rows.length) {
			Debug.trace("All rows were dupes in update, skipping");
			return;
		}
		
		rows.forEach( function(row) {
			self.rows.push( row );
		});
		
		// sort just in case
		this.rows = this.rows.sort( function(a, b) {
			return (a.date - b.date);
		});
		
		// discard old if beyond length
		while (this.rows.length > args.length) this.rows.shift();
		
		// we need to apply range minimum and maximum again, because time moves forward
		this.calcDataRange();
		
		// update and render data range display in control strip
		this.updateDataRangeDisplay();
		
		// trigger visible graph redraw (also happens on debounced scroll)
		this.div.find('div.graph_container').addClass('dirty');
		this.onScrollDebounce();
		this.updateInfo();
	},
	
	updateInfo: function() {
		// show alerts info
		var self = this;
		
		if (!this.isRealTime() || !this.alerts || !this.alerts.hostnames) {
			this.div.find('#fs_overview_alerts').empty().hide();
			return;
		}
		
		var all_alerts = [];
		for (var hostname in this.alerts.hostnames) {
			var host_alerts = this.alerts.hostnames[hostname];
			for (var alert_id in host_alerts) {
				var alert = host_alerts[alert_id];
				var group_def = app.findGroupFromHostname( hostname );
				
				all_alerts.push( merge_objects( alert, {
					id: alert_id,
					group_id: group_def ? group_def.id : '',
					hostname: hostname
				} ) );
			} // foreach alert
		} // foreach hostname
		
		if (!all_alerts.length) {
			this.div.find('#fs_overview_alerts').empty().hide();
			return;
		}
		
		// sort by alert ID, then by hostname
		all_alerts = all_alerts.sort( function(a, b) {
			return (a.id == b.id) ? a.hostname.localeCompare(b.hostname) : a.id.localeCompare( b.id );
		} );
		
		// build alert table
		var html = '';
		html += '<legend style="color:red">Current Alerts</legend>';
		html += '<table class="fieldset_table" width="100%">';
		html += '<tr>';
			html += '<th>Alert</th>';
			html += '<th>Hostname</th>';
			html += '<th>Group</th>';
			html += '<th>Detail</th>';
			html += '<th>Trigger</th>';
			html += '<th>Date/Time</th>';
			html += '<th>Actions</th>';
		html += '</tr>';
		
		all_alerts.forEach( function(alert) {
			var alert_def = find_object( config.alerts, { id: alert.id } ) || { 
				id: alert.id,
				title: '(' + alert.id + ')',
				expression: 'n/a'
			};
			var group_def = alert.group_id ? find_object( config.groups, { id: alert.group_id } ) : null;
			
			html += '<tr>';
			html += '<td><b>' + self.getNiceAlert(alert_def, true) + '</b></td>';
			html += '<td>' + self.getNiceHostname(alert.hostname, true) + '</td>';
			html += '<td>' + self.getNiceGroup(group_def) + '</td>';
			html += '<td>' + alert.message + '</td>';
			html += '<td style="font-family:monospace">' + alert_def.expression + '</pre></td>';
			html += '<td>' + get_nice_date_time( alert.date ) + '</td>';
			
			var snap_id = alert.hostname + '/' + Math.floor( alert.date / 60 );
			html += '<td><a href="#Snapshot?id=' + snap_id + '">View&nbsp;Snapshot</a></td>';
			
			html += '</tr>';
		});
		
		html += '</table>';
		this.div.find('#fs_overview_alerts').empty().html(html).show();
	},
	
	getNiceGroup: function(item) {
		// get formatted group with icon, plus optional link
		var link = true;
		var html = '';
		if (!item) return '(None)';
		
		var query = { group: item.id };
		if (this.args && ('offset' in this.args)) query.offset = this.args.offset;
		if (this.args && this.args.length) query.length = this.args.length;
		
		var icon = '<i class="mdi mdi-server-network">&nbsp;</i>';
		if (link) {
			html += '<a href="#Group' + compose_query_string(query) + '" style="text-decoration:none">';
			html += icon + '<span style="text-decoration:underline">' + item.title + '</span></a>';
		}
		else {
			html += icon + item.title;
		}
		
		return html;
	},
	
	isRealTime: function() {
		// return true if current page is in realtime mode, false otherwise
		var args = this.args;
		return (args.offset == 0 - args.length);
	},
	
	navCtrlBack: function() {
		// jump backward in time
		var args = this.args;
		args.offset -= args.length;
		this.navToArgs();
	},
	
	navCtrlForward: function() {
		// jump forward in time
		var args = this.args;
		if (!this.isRealTime()) {
			args.offset += args.length;
			this.navToArgs();
		}
	},
	
	applyMonitorFilter: function(initial) {
		// hide/show graphs based on current filter text
		if (!this.groups || !this.groups.length) return;
		var self = this;
		var filterMatch = new RegExp( escape_regexp(app.monitorFilter || '') || '.+', "i" );
		var changes = 0;
		var num_filtered = 0;
		var total_graphs = 0;
		
		this.groups.forEach( function(group_def) {
			var monitors = app.findMonitorsFromGroup( group_def );
			if (!monitors.length) return;
			
			monitors.forEach( function(mon_def, idx) {
				if (!mon_def.merge_type) return;
				var combo_id = group_def.id + '_' + mon_def.id;
				var visible = !!(mon_def.title.match(filterMatch) || mon_def.id.match(filterMatch));
				var $cont = self.div.find('#d_graph_ov_' + combo_id);
				
				if (visible && $cont.hasClass('filtered')) {
					$cont.removeClass('filtered').addClass('dirty');
					changes++;
				}
				else if (!visible && !$cont.hasClass('filtered')) {
					$cont.addClass('filtered');
					changes++;
				}
				if (!visible) num_filtered++;
				total_graphs++;
			}); // foreach monitor
		}); // foreach group
		
		if (changes && !initial) {
			this.onScrollDebounce();
		}
		
		if (num_filtered == total_graphs) {
			this.div.find('#fs_all_filtered').show();
		}
		else {
			this.div.find('#fs_all_filtered').hide();
		}
	},
	
	onThemeChange: function(theme) {
		// user has changed theme, update graphs
		if (this.graphs) {
			this.div.find('div.graph_container').addClass('dirty');
			this.onScrollDebounce();
		}
	},
	
	onDeactivate: function() {
		// called when page is deactivated
		if (this.graphs) {
			for (var key in this.graphs) {
				this.graphs[key].destroy();
			}
		}
		this.graphs = null;
		this.div.html( '' );
		return true;
	}
	
} );
