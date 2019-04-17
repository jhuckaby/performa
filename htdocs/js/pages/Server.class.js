Class.subclass( Page.Base, "Page.Server", {	
	
	onInit: function() {
		// called once at page load
		var html = '';
		this.div.html( html );
		this.initQueue();
	},
	
	onActivate: function(args) {
		// page activation
		var self = this;
		if (!this.requireLogin(args)) return true;
		
		if (!args) args = {};
		this.args = args;
		
		// default to hourly (which is also used for real-time)
		if (!args.sys) args.sys = 'hourly';
		
		// if no server specified in args, default to first server in recent contrib list
		if (!args.hostname && this.lastHostname) {
			args.hostname = this.lastHostname;
		}
		if (!args.hostname) {
			args.hostname = hash_keys_to_array(app.recent_hostnames).sort().shift();
		}
		if (!args.hostname) {
			this.doInlineError('No Servers Found', 'No servers have submitted any monitoring data yet.');
			return true;
		}
		this.lastHostname = args.hostname;
		
		if (!args.date && !args.length) {
			// default to realtime hourly
			args.offset = -60;
			args.length = 60;
		}
		// date always needs to be treated as a string
		if (args.date) args.date = '' + args.date;
		
		app.setWindowTitle('Server Detail: ' + args.hostname);
		app.showTabBar(true);
		this.showControls(true);
		
		// Realtime views:
		// #Server?hostname=foo.com&sys=hourly&offset=-60&length=60
		// #Server?hostname=foo.com&sys=hourly&offset=-180&length=180
		// #Server?hostname=foo.com&sys=hourly&offset=-360&length=360
		// #Server?hostname=foo.com&sys=hourly&offset=-720&length=720
		
		// Historical views:
		// #Server?hostname=foo.com&sys=hourly&date=2019/02/23/12
		// #Server?hostname=foo.com&sys=daily&date=2019/02/23
		// #Server?hostname=foo.com&sys=monthly&date=2019/02
		// #Server?hostname=foo.com&sys=yearly&date=2019
		
		this.graphs = null;
		
		if (this.div.is(':empty')) {
			this.div.addClass('loading');
		}
		
		this.requestData();
		return true;
	},
	
	requestData: function() {
		// request server data and metadata for this view
		var self = this;
		var args = this.args;
		
		app.api.get( 'app/view/verbose', args, this.receiveData.bind(this), function(err) {
			if (err.code == "no_data") self.doInlineError( "No Data Found", "No data was found in the specified time range." );
			else self.doInlineError( "Server Error", err.description );
		} );
	},
	
	receiveData: function(data) {
		// receive view data from server
		// data: { code, hostname, rows, metadata }
		var self = this;
		var args = this.args;
		this.div.removeClass('loading');
		this.rows = data.rows;
		this.metadata = data.metadata;
		
		if (!this.rows.length || !this.metadata) {
			return this.doInlineError('No Data Found', 'No data was found for server "' + this.args.hostname + '", in the specified time range.');
		}
		
		this.group = app.findGroupFromHostData( this.metadata );
		if (!this.group) {
			return this.doInlineError("No matching group found for server: " + this.args.hostname);
		}
		
		this.monitors = app.findMonitorsFromGroup( this.group );
		if (!this.monitors.length) {
			return this.doInlineError("No matching monitors for group: " + this.group.title);
		}
		
		// data comes in as totals (may be more than one sample per timestamp), so pre-average everything
		this.rows.forEach( function(row) {
			for (var key in row.totals) {
				row.totals[key] /= row.count || 1;
			}
		});
		
		var html = '';
		// html += '<h1>' + this.args.hostname + '</h1>';
		
		// insert alerts and server info here
		// (will be populated later)
		html += '<fieldset id="fs_server_alerts" style="margin-top:10px; display:none"></fieldset>';
		html += '<fieldset id="fs_server_info" style="margin-top:10px; display:none"></fieldset>';
		
		html += '<div class="graphs server size_' + app.getPref('graph_size') + '" style="margin-top:10px;">';
		
		// graph placeholders
		this.monitors.forEach( function(mon_def) {
			html += '<div id="d_graph_server_' + mon_def.id + '" class="graph_container" data-mon="' + mon_def.id + '">';
			html += '<div class="graph_button copy"><i class="mdi mdi-clipboard-pulse-outline mdi-lg" title="Copy Graph Image URL" onMouseUp="$P().copyGraphImage(this)"></i></div>';
			html += '<div id="c_graph_server_' + mon_def.id + '"></div>';
			html += '</div>';
		});
		
		html += '<div class="clear"></div>';
		html += '</div>';
		
		// for when all graphs are filtered out:
		html += '<fieldset class="inline_error" id="fs_all_filtered" style="display:none">';
		html += '<div class="inline_error_title">All Graphs Filtered</div>';
		html += '<div class="inline_error_msg">Please enter a different filter query.</div>';
		html += '</fieldset>';
		
		this.div.html(html);
		
		// create all graphs without data
		this.graphs = {};
		
		this.monitors.forEach( function(mon_def, idx) {
			self.graphs[mon_def.id] = self.createGraph({
				id: mon_def.id,
				title: mon_def.title,
				data_type: mon_def.data_type,
				suffix: mon_def.suffix || '',
				num_layers: 1,
				canvas_id: 'c_graph_server_' + mon_def.id,
				color: self.graphColors[ idx % self.graphColors.length ]
			});
		});
		
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
		var range_min = 0;
		var range_max = 0;
		
		if (this.isRealTime()) {
			range_min = (time_now() + (args.offset * 60)) * 1000;
			range_max = (time_now() + (args.offset * 60) + (args.length * 60)) * 1000;
		}
		
		// save these for later
		this.range_min = range_min;
		this.range_max = range_max;
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
		
		if (!this.isRealTime()) return;
		
		this.rows.forEach( function(row) {
			if (self.isRowInRange(row)) {
				if (!min_date || (row.date < min_date)) min_date = row.date;
				if (!max_date || (row.date > max_date)) max_date = row.date;
			}
		});
		
		// display data range
		this.displayDataRange( min_date, max_date );
	},
	
	updateGraph: function(mon_id) {
		// update single graph
		// called on dequeue
		var self = this;
		var graph = this.graphs[mon_id];
		var graph_rows = [];
		var alert_times = [];
		
		// see if graph is still visible (queue delay -- user could have scrolled past)
		if (!this.div.find('#d_graph_server_' + mon_id).visible(true, true)) {
			this.div.find('#d_graph_server_' + mon_id).addClass('dirty');
			return;
		}
		
		// pre-scan alerts for monitor_id for optimization
		var active_alerts = {};
		config.alerts.forEach( function(alert_def) {
			if (alert_def.monitor_id == mon_id) active_alerts[ alert_def.id ] = true;
		});
		
		// process each row
		this.rows.forEach( function(row) {
			if ((mon_id in row.totals) && self.isRowInRange(row)) {
				graph_rows.push({ x: row.date * 1000, y: row.totals[mon_id] });
				
				if (row.alerts) {
					var yes_alert = false;
					
					for (var alert_id in row.alerts) {
						if (active_alerts[alert_id]) { yes_alert = true; break; }
					} // foreach alert
					
					if (yes_alert) alert_times.push( row.date * 1000 );
				} // alerts
			} // in range
		});
		
		// setup chart series
		var label = this.formatHostname( this.args.hostname );
		var series = [{
			name: label,
			data: self.crushData( graph_rows )
		}];
		
		// setup annotations
		var x_annos = [];
		alert_times.forEach( function(x) {
			x_annos.push({
				x: x,
				borderColor: '#888',
				yAxisIndex: 0,
				label: {
					show: true,
					text: 'Alert',
					style: {
						color: "#fff",
						background: '#f00'
					}
				}
			});
		});
		
		// redraw graph series and annos
		var options = this.getGraphConfig(mon_id);
		options.series = series;
		options.annotations = {
			xaxis: x_annos
		};
		graph.updateOptions(options, true, false);
	},
	
	onScrollDebounce: function() {
		// called for redraw, and for scroll (debounced)
		// find all graphs which are dirty AND visible, and update them
		var self = this;
		
		this.div.find('div.graph_container.dirty').each( function() {
			var $this = $(this);
			if (!$this.hasClass('filtered') && $this.visible(true, true)) {
				var mon_id = $this.data('mon');
				Debug.trace('graph', "Rendering graph for scroll event: " + mon_id);
				self.enqueue( self.updateGraph.bind(self, mon_id) );
				$this.removeClass('dirty');
				
				// reset copy icon, just in case
				$this.find('div.graph_button.copy > i').removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
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
			
			app.api.get( 'app/view/verbose', temp_args, this.receiveUpdate.bind(this), function(err) {
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
			
			app.api.get( 'app/view/verbose', args, this.receiveUpdate.bind(this), function(err) {
				app.doError( "Server Error: " + err.description );
			} );
		}
	},
	
	receiveUpdate: function(data) {
		// receive update from server
		// data: { code, hostname, rows, metadata }
		var self = this;
		var rows = data.rows;
		var args = this.args;
		
		this.metadata = data.metadata;
		
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
		
		// data comes in as totals (may be more than one sample per timestamp), so pre-average everything
		rows.forEach( function(row) {
			for (var key in row.totals) {
				row.totals[key] /= row.count || 1;
			}
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
	
	createPie: function(pie) {
		// create pie (donut) chart with apex
		// pie: { id, title, subtitle, value, max }
		var $cont = this.div.find('#' + pie.id);
		var $elem = $cont.find('div.server_pie_graph');
		var $overlay = $cont.find('div.server_pie_overlay');
		
		$overlay.html(
			'<div class="pie_overlay_title">' + pie.title + '</div>' + 
			'<div class="pie_overlay_subtitle">' + pie.subtitle + '</div>'
		);
		
		if (pie.value > pie.max) pie.value = pie.max;
		else if (pie.value < 0) pie.value = 0;
		
		var series = [ pie.value, pie.max - pie.value ];
		var amount = pie.value / pie.max;
		
		var color = '';
		if (amount >= 0.75) color = 'rgba(255, 0, 0, 0.75)';
		else if (amount >= 0.5) color = 'rgba(224, 224, 0, 0.85)';
		else color = '#080';
		var colors = [ color, 'rgba(128, 128, 128, 0.2)' ];
		
		var options = {
			chart: {
				type: 'donut',
				animations: {
					enabled: false
				}
			},
			dataLabels: {
				enabled: false
			},
			series: series,
			colors: colors,
			plotOptions: {
				pie: {
					customScale: 1.6,
					offsetY: 15,
					donut: {
						size: '55%',
						background: 'transparent',
						labels: {
							show: false
						}
					},
					expandOnClick: false
				}
			},
			stroke: {
				show: false
			},
			legend: {
				show: false
			},
			tooltip: {
				enabled: false
			}
		}; // options
		
		var chart = new ApexCharts( $elem.get(0), options );
		chart.render();
		return chart;
	},
	
	updatePie: function(chart, pie) {
		// update donut value
		// pie: { id, subtitle, value, max }
		var $cont = this.div.find('#' + pie.id);
		var $overlay = $cont.find('div.server_pie_overlay');
		
		$overlay.find('.pie_overlay_subtitle').html( pie.subtitle );
		
		if (pie.value > pie.max) pie.value = pie.max;
		else if (pie.value < 0) pie.value = 0;
		
		var series = [ pie.value, pie.max - pie.value ];
		var amount = pie.value / pie.max;
		
		var color = '';
		if (amount >= 0.75) color = 'rgba(255, 0, 0, 0.75)';
		else if (amount >= 0.5) color = 'rgba(224, 224, 0, 0.85)';
		else color = '#080';
		var colors = [ color, 'rgba(128, 128, 128, 0.2)' ];
		
		var options = {
			series: series,
			colors: colors
		};
		
		chart.updateOptions( options, true, false );
	},
	
	updateInfo: function() {
		// update server alerts and info
		var self = this;
		var args = this.args;
		var metadata = this.metadata;
		
		// gather alerts in realtime mode
		var all_alerts = [];
		if (metadata.alerts) {
			for (var alert_id in metadata.alerts) {
				all_alerts.push( 
					merge_objects( metadata.alerts[alert_id], { 
						id: alert_id, 
						hostname: args.hostname 
					} )
				);
			} // foreach alert
		} // has alerts
		
		if (all_alerts.length && this.isRealTime()) {
			// build alert table
			var html = '';
			html += '<legend style="color:red">Current Alerts</legend>';
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
			this.div.find('#fs_server_alerts').empty().html(html).show();
		}
		else {
			// no alerts, hide entire fieldset
			this.div.find('#fs_server_alerts').empty().hide();
		}
		
		// any filter at all hides info fieldset
		if (app.monitorFilter) {
			if (this.cpu_graph) {
				this.cpu_graph.destroy();
				delete this.cpu_graph;
			}
			if (this.mem_graph) {
				this.mem_graph.destroy();
				delete this.mem_graph;
			}
			if (this.disk_graph) {
				this.disk_graph.destroy();
				delete this.disk_graph;
			}
			this.div.find('#fs_server_info').empty().hide();
			return;
		}
		
		// server info table: fs_server_info
		if (this.cpu_graph) {
			// update existing graphs, do not redraw
			this.updatePie( this.cpu_graph, {
				id: 'd_server_pie_cpu',
				subtitle: short_float(metadata.data.load ? metadata.data.load[0] : 0),
				value: metadata.data.load ? metadata.data.load[0] : 0,
				max: metadata.data.cpu ? metadata.data.cpu.cores : 0
			});
			
			this.updatePie( this.mem_graph, {
				id: 'd_server_pie_mem',
				subtitle: get_text_from_bytes(metadata.data.memory.used || 0),
				value: metadata.data.memory.used || 0,
				max: metadata.data.memory.total || 0
			});
			
			this.updatePie( this.disk_graph, {
				id: 'd_server_pie_disk',
				subtitle: pct( metadata.data.mounts.root.use, 100, false ),
				value: metadata.data.mounts.root.use || 0,
				max: 100
			});
			
			// uptime may change
			this.div.find('#d_server_uptime').html( get_text_from_seconds(metadata.data.uptime_sec || 0, false, true) );
		}
		else if (this.isRealTime()) {
			// build content
			var html = '';
			html += '<legend>Current Server Info</legend>';
			
			// flex (god help me)
			html += '<div style="display:flex; justify-content:space-between; margin:5px 10px 5px 10px;">';
			
			// column 1 (info)
			html += '<div class="server_info_column">';
				html += '<div class="info_label">Hostname</div>';
				html += '<div class="info_value">' + args.hostname + '</div>';
				
				html += '<div class="info_label">IP Address</div>';
				html += '<div class="info_value">' + (metadata.ip || 'n/a') + '</div>';
				
				var group_def = find_object( config.groups, { id: metadata.group } ) || { 
					id: metadata.group,
					title: '(' + metadata.group + ')'
				};
				
				var query = { group: metadata.group };
				if (this.args && this.args.sys) query.sys = this.args.sys;
				if (this.args && this.args.date) query.date = this.args.date;
				if (this.args && ('offset' in this.args)) query.offset = this.args.offset;
				if (this.args && this.args.length) query.length = this.args.length;
				
				// this.formatHostname(args.hostname)
				// metadata.ip
				
				html += '<div class="info_label">Group Membership</div>';
				html += '<div class="info_value">' + this.getNiceGroup(group_def, '#Group' + compose_query_string(query)) + '</div>';
				
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
				
				html += '<div class="info_label">Total RAM</div>';
				html += '<div class="info_value">' + get_text_from_bytes(metadata.data.memory.total || 0) + '</div>';
			html += '</div>';
			
			// column 1B (info cont)
			html += '<div class="server_info_column">';
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
				
				html += '<div class="info_label">Uptime</div>';
				html += '<div id="d_server_uptime" class="info_value" style="margin-bottom:0;">' + get_text_from_seconds(metadata.data.uptime_sec || 0, false, true) + '</div>';
			html += '</div>';
			
			// column 2 (cpu graph)
			html += '<div class="server_info_column">';
				html += '<div id="d_server_pie_cpu" class="server_pie_container"><div class="server_pie_graph"></div><div class="server_pie_overlay"></div></div>';
			html += '</div>';
			
			// column 3 (mem graph)
			html += '<div class="server_info_column">';
				html += '<div id="d_server_pie_mem" class="server_pie_container"><div class="server_pie_graph"></div><div class="server_pie_overlay"></div></div>';
			html += '</div>';
			
			// column 4 (disk graph)
			html += '<div class="server_info_column">';
				html += '<div id="d_server_pie_disk" class="server_pie_container"><div class="server_pie_graph"></div><div class="server_pie_overlay"></div></div>';
			html += '</div>';
			
			// html += '<div class="clear"></div>';
			html += '</div>';
			this.div.find('#fs_server_info').empty().html(html).show();
			
			// create pie graphs
			this.cpu_graph = this.createPie({
				id: 'd_server_pie_cpu',
				title: 'Load',
				subtitle: short_float(metadata.data.load ? metadata.data.load[0] : 0),
				value: metadata.data.load ? metadata.data.load[0] : 0,
				max: metadata.data.cpu ? metadata.data.cpu.cores : 0
			});
			
			this.mem_graph = this.createPie({
				id: 'd_server_pie_mem',
				title: 'Mem',
				subtitle: get_text_from_bytes(metadata.data.memory.used || 0),
				value: metadata.data.memory.used || 0,
				max: metadata.data.memory.total || 0
			});
			
			this.disk_graph = this.createPie({
				id: 'd_server_pie_disk',
				title: 'Disk',
				subtitle: pct( metadata.data.mounts.root.use, 100, false ),
				value: metadata.data.mounts.root.use || 0,
				max: 100
			});
		}
		else {
			// not real-time, hide entire fieldset
			this.div.find('#fs_server_info').empty().hide();
		}
	},
	
	applyMonitorFilter: function(initial) {
		// hide/show graphs based on current filter text
		if (!this.monitors || !this.monitors.length) return;
		var self = this;
		var filterMatch = new RegExp( escape_regexp(app.monitorFilter || '') || '.+', "i" );
		var changes = 0;
		var num_filtered = 0;
		
		this.monitors.forEach( function(mon_def, idx) {
			var visible = !!(mon_def.title.match(filterMatch) || mon_def.id.match(filterMatch));
			var $cont = self.div.find('#d_graph_server_' + mon_def.id);
			
			if (visible && $cont.hasClass('filtered')) {
				$cont.removeClass('filtered').addClass('dirty');
				changes++;
			}
			else if (!visible && !$cont.hasClass('filtered')) {
				$cont.addClass('filtered');
				changes++;
			}
			if (!visible) num_filtered++;
		});
		
		if (changes && !initial) {
			this.onScrollDebounce();
		}
		if (!initial) {
			this.updateInfo();
		}
		if (num_filtered == this.monitors.length) {
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
		if (this.cpu_graph) {
			this.cpu_graph.destroy();
			delete this.cpu_graph;
		}
		if (this.mem_graph) {
			this.mem_graph.destroy();
			delete this.mem_graph;
		}
		if (this.disk_graph) {
			this.disk_graph.destroy();
			delete this.disk_graph;
		}
		
		this.queue = [];
		if (this.queueTimer) clearTimeout( this.queueTimer );
		this.graphs = null;
		this.div.html( '' );
		return true;
	}
	
} );
