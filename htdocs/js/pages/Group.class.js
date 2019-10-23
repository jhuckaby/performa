Class.subclass( Page.Base, "Page.Group", {	
	
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
		var renav = false;
		
		// default to hourly (which is also real-time)
		if (!args.sys) {
			args.sys = 'hourly';
			renav = true;
		}
		
		// if no group specified in args, default to first group in list
		if (!args.group && app.getPref('last_group_id')) {
			args.group = app.getPref('last_group_id');
			renav = true;
		}
		if (!args.group) {
			args.group = config.groups[0].id;
			renav = true;
		}
		app.setPref('last_group_id', args.group);
		
		if (!args.date && !args.length) {
			// default to realtime hourly
			args.offset = -60;
			args.length = 60;
			renav = true;
		}
		// date always needs to be treated as a string
		if (args.date) args.date = '' + args.date;
		
		if (renav) this.navReplaceArgs();
		
		// store group and monitors in page
		this.group = find_object( config.groups, { id: args.group } );
		if (!this.group) {
			return this.doInlineError("Group definition not found: " + args.group);
		}
		
		this.monitors = app.findMonitorsFromGroup( this.group );
		if (!this.monitors.length) {
			return this.doInlineError("No matching monitors for group: " + this.group.title);
		}
		
		app.setWindowTitle('Group Detail: ' + this.group.title);
		app.showTabBar(true);
		this.showControls(true);
		this.tab[0]._page_id = Nav.currentAnchor();
		
		// Realtime views:
		// #Group?group=main&sys=hourly&offset=-60&length=60
		// #Group?group=main&sys=hourly&offset=-180&length=180
		// #Group?group=main&sys=hourly&offset=-360&length=360
		// #Group?group=main&sys=hourly&offset=-720&length=720
		
		// Historical views:
		// #Group?group=main&sys=hourly&date=2019/02/23/12
		// #Group?group=main&sys=daily&date=2019/02/23
		// #Group?group=main&sys=monthly&date=2019/02
		// #Group?group=main&sys=yearly&date=2019
		
		this.rec_dead = {};
		this.graphs = null;
		
		if (this.div.is(':empty')) {
			this.div.addClass('loading');
		}
		
		this.requestData();
		return true;
	},
	
	requestData: function() {
		// request contributors (contrib) data for our group and range
		// this is for both real-time and historical views
		var self = this;
		var args = this.args;
		
		this.lastUpdate = time_now();
		
		app.api.get( 'app/contrib', args, function(data) {
			// {code: 0, hostnames: {joedark.local: 1, mini.local: 1}}
			
			if (!data.hostnames || !num_keys(data.hostnames)) {
				return self.doInlineError('No Data Found', 'No data was found for group "' + self.group.title + '", in the specified time range.');
			}
			
			// store hostnames in page
			self.hostnames = data.hostnames;
			
			// sort hosts
			self.hosts = hash_keys_to_array(self.hostnames).sort().map( function(hostname, idx) {
				return { hostname: hostname, idx: idx };
			});
			
			// now we can setup the graphs and request data samples
			self.setupGraphs();
			
			// if we're in real-time mode, merge hosts with recent and redraw jump menu
			if (self.isRealTime()) app.updateRecentHostnames( data.hostnames );
		}, 
		function(err) {
			if (err.code == "no_data") self.doInlineError( "No Data Found", "No data was found in the specified time range." );
			else self.doInlineError( "Server Error", err.description );
		} );
	},
	
	setupGraphs: function() {
		// render graph skeletons, assign layers, request data
		var self = this;
		var args = this.args;
		
		var html = '';
		// html += '<h1>' + this.group.title + '</h1>';
		html += '<div class="subtitle" style="margin-top:10px; margin-bottom:15px;">';
			html += '<i class="mdi mdi-server-network">&nbsp;</i>' + this.group.title + "";
			html += '<div class="subtitle_widget"><span class="link" onMouseUp="$P().editGroupWatch()"><i class="mdi mdi-eye mdi-lg">&nbsp;</i><b>Watch Group...</b></span></div>';
			html += '<div class="subtitle_widget"><span class="link" onMouseUp="$P().takeSnapshot()"><i class="fa fa-camera">&nbsp;</i><b>Take Snapshot</b></span></div>';
			html += '<div class="clear"></div>';
		html += '</div>';
		
		// insert alerts and server list table here
		// (will be populated later)
		html += '<fieldset id="fs_group_alerts" style="margin-top:10px; display:none"></fieldset>';
		html += '<fieldset id="fs_group_info" style="margin-top:10px; display:none"></fieldset>';
		
		// graph container
		html += '<div class="graphs group size_' + app.getPref('graph_size') + '" style="margin-top:10px;">';
		
		// graph placeholders
		this.monitors.forEach( function(mon_def) {
			html += '<div id="d_graph_group_' + mon_def.id + '" class="graph_container" data-mon="' + mon_def.id + '">';
			html += '<div class="graph_button copy"><i class="mdi mdi-clipboard-pulse-outline mdi-lg" title="Copy Graph Image URL" onMouseUp="$P().copyGraphImage(this)"></i></div>';
			
			var menu_opts = [ ['', "Multi-Line"], ['total', "Total"], ['avg', "Average"], ['min', "Minimum"], ['max', "Maximum"] ];
			html += '<div class="graph_button menu" title="Change Graph Type"><i class="mdi mdi-settings mdi-lg"></i>';
			html += '<select onChange="$P().changeMergeType(this)"><optgroup label="Graph Type">' + render_menu_options(menu_opts, app.getPref('ggt_' + mon_def.id)) + '</optgroup></select></div>';
			
			html += '<div id="c_graph_group_' + mon_def.id + '"></div>';
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
		this.createGraphs();
		
		// calculate min/max for data bounds
		this.calcDataRange();
		
		// apply filters if any
		this.applyMonitorFilter(true);
		
		// fetch data from all servers in group simultaneously
		// the browser will throttle these to ~6 in parallel
		this.expecting = this.hosts.length;
		this.hosts.forEach( function(host) {
			var hostname = host.hostname;
			var server_args = copy_object(args);
			server_args.hostname = hostname;
			
			app.api.get( 'app/view', server_args, self.receiveData.bind(self), function(err) {
				// self.doInlineError( "API Error", err.description );
				// this is less of a page-destroying error in group view, so just log and move on
				Debug.trace('api', "API Error for " + hostname + ": " + err.description);
				
				self.expecting--;
				if (!self.expecting) {
					// welp, that was the final server we were waiting for, so trigger graph redraw now
					self.div.find('div.graph_container').addClass('dirty');
					self.onScrollDebounce();
					self.updateInfo();
					self.updateDataRangeDisplay();
				}
			} );
		});
	},
	
	createGraphs: function() {
		// create initial chart.js graphs (sans data, just layers)
		var self = this;
		
		// we have all the hostnames at this point, so might as well send in the legend labels
		var labels = this.hosts.map( function(host) {
			return self.formatHostname( host.hostname );
		});
		
		this.monitors.forEach( function(mon_def, idx) {
			var opts = null;
			var merge_type = app.getPref('ggt_' + mon_def.id);
			
			if (merge_type) {
				// merge multi-line into avg/min/max (per-graph user pref)
				opts = {
					id: mon_def.id,
					title: ucfirst(merge_type) + " " + mon_def.title,
					labels: [ ucfirst(merge_type.replace(/avg/, 'average')) ],
					color: self.graphColors[ idx % self.graphColors.length ],
					data_type: mon_def.data_type,
					suffix: mon_def.suffix || '',
					num_layers: 1,
					canvas_id: 'c_graph_group_' + mon_def.id,
					no_fill: false,
					show_legend: false
				};
			}
			else {
				// standard multi-line presentation
				opts = {
					id: mon_def.id,
					title: mon_def.title,
					labels: labels,
					data_type: mon_def.data_type,
					suffix: mon_def.suffix || '',
					num_layers: self.hosts.length,
					canvas_id: 'c_graph_group_' + mon_def.id,
					no_fill: true, // force line graphs, even if only 1 server in group
					show_legend: true // always show legend in group view
				};
			}
			
			self.graphs[mon_def.id] = self.createGraph(opts);
		});
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
		
		this.hosts.forEach( function(host) {
			if (!host.rows) return;
			host.rows.forEach( function(row) {
				if (self.isRowInRange(row)) {
					if (!min_date || (row.date < min_date)) min_date = row.date;
					if (!max_date || (row.date > max_date)) max_date = row.date;
				}
			}); // foreach row
		}); // foreach host
		
		// display data range
		this.displayDataRange( min_date, max_date );
	},
	
	receiveData: function(data) {
		// receive view data from one single server in group
		// data: { code, hostname, rows, metadata }
		var self = this;
		var args = this.args;
		this.div.removeClass('loading');
		
		// find matching host object so we can store stuff in it
		var host = find_object( this.hosts, { hostname: data.hostname } );
		if (!host) return app.doError("Hostname not found: " + data.hostname); // should never happen
		
		host.rows = data.rows;
		host.metadata = data.metadata;
		
		if (!host.rows.length) {
			Debug.trace('api', 'No data was found for server "' + data.hostname + '", in the specified time range.');
		}
		
		// data comes in as totals (may be more than one sample per timestamp), so pre-average everything
		host.rows.forEach( function(row) {
			for (var key in row.totals) {
				row.totals[key] /= row.count || 1;
			}
		});
		
		// trigger visible graph redraw (also happens on debounced scroll)
		// only if all hosts have reported in (reduce number of graph draws)
		this.expecting--;
		if (!this.expecting) {
			this.div.find('div.graph_container').addClass('dirty');
			this.onScrollDebounce();
			this.updateInfo();
			this.updateDataRangeDisplay();
		}
	},
	
	updateGraph: function(mon_id) {
		// update single graph
		// called on dequeue
		var self = this;
		var graph = this.graphs[mon_id];
		var series = [];
		var alert_times = [];
		var min_date = time_now();
		
		// see if graph is still visible (queue delay -- user could have scrolled past)
		if (!this.div.find('#d_graph_group_' + mon_id).visible(true, true)) {
			this.div.find('#d_graph_group_' + mon_id).addClass('dirty');
			return;
		}
		
		// pre-scan alert defs for monitor_id (for optimization in inner loop below)
		var active_alerts = {};
		config.alerts.forEach( function(alert_def) {
			if (alert_def.monitor_id == mon_id) active_alerts[ alert_def.id ] = true;
		});
		
		var sys_def = find_object( config.systems, { id: this.args.sys } ) || { epoch_div: 9999999 };
		
		this.hosts.forEach( function(host) {
			// build datasets for each host (layer)
			var graph_rows = [];
			var last_row = null;
			
			if (host.rows) host.rows.forEach( function(row) {
				if ((mon_id in row.totals) && self.isRowInRange(row)) {
					// handle gaps
					if (last_row && (row.date - last_row.date > sys_def.epoch_div * 2)) {
						// insert null gap
						graph_rows.push({ x: (last_row.date * 1000) + 1, y: null });
					}
					
					graph_rows.push({ x: row.date * 1000, y: row.totals[mon_id] });
					
					if (row.date < min_date) min_date = row.date;
					
					if (row.alerts) {
						var yes_alert = false;
						
						for (var alert_id in row.alerts) {
							if (active_alerts[alert_id]) { yes_alert = true; break; }
						} // foreach alert
						
						if (yes_alert) alert_times.push( row.date * 1000 );
					} // alerts
					
					last_row = row;
				} // in range
			}); // foreach row
			
			series.push({
				name: self.formatHostname( host.hostname ),
				data: self.crushData( graph_rows )
			});
		}); // foreach host
		
		// possibly merge all series into single dataset (min/avg/max/total)
		if (app.getPref('ggt_' + mon_id)) {
			series = this.mergeMultiSeries( mon_id, series );
		}
		
		// setup annotations
		var x_annos = [];
		if (app.getPref('annotations') == '1') {
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
			
			if (this.isRealTime()) {
				// allow a few minutes of slack here, just in case a server had a hiccup
				var min_x = (min_date + 180) * 1000;
				
				series.forEach( function(item, idx) {
					var rows = item.data;
					if (rows.length && (rows[0].x > min_x)) {
						x_annos.push({
							x: rows[0].x,
							borderColor: '#888',
							yAxisIndex: 0,
							label: {
								show: true,
								text: 'New',
								style: {
									color: "#fff",
									// background: '#080'
									background: self.graphColors[ idx % self.graphColors.length ]
								}
							}
						}); // x_annos.push
					} // new host
				} ); // foreach series
			} // real-time
		} // annotations enabled
		
		// redraw graph series and annos
		var options = this.getGraphConfig(mon_id);
		options.series = series;
		options.annotations = {
			xaxis: x_annos
		};
		graph.updateOptions(options, true, false);
	},
	
	onScrollDebounce: function(instant) {
		// called for redraw, and for scroll (debounced)
		// find all graphs which are dirty AND visible, and update them
		var self = this;
		
		this.div.find('div.graph_container.dirty').each( function() {
			var $this = $(this);
			if (!$this.hasClass('filtered') && $this.visible(true, true)) {
				var mon_id = $this.data('mon');
				Debug.trace('graph', "Rendering graph for scroll event: " + mon_id);
				$this.removeClass('dirty');
				
				// reset copy icon, just in case
				$this.find('div.graph_button.copy > i').removeClass().addClass('mdi mdi-clipboard-pulse-outline mdi-lg');
				
				if (instant) self.updateGraph(mon_id);
				else self.enqueue( self.updateGraph.bind(self, mon_id), mon_id );
			}
		});
	},
	
	updateGroupData: function(overrides) {
		// update entire group for 30s refresh, or focus refresh
		// overrides can reset any page args, like setting offset/length to -1/1
		// (this is ONLY called for real-time views)
		var self = this;
		var args = this.args;
		if (!overrides) overrides = {};
		
		// special case: if we are in an error state, perform a full refresh
		if (!this.graphs) return this.requestData();
		
		Debug.trace("Requesting group data update");
		this.lastUpdate = time_now();
		
		// recalculate this, as time moves ever forward
		this.calcDataRange();
		
		// first, we need to see if contrib has changed (new servers may have joined the group)
		var contrib_args = merge_objects(args, overrides);
		
		app.api.get( 'app/contrib', contrib_args, function(data) {
			// {code: 0, hostnames: {joedark.local: 1, mini.local: 1}}
			
			if (!data.hostnames || !num_keys(data.hostnames)) {
				Debug.trace('api', 'No data was found for group "' + self.group.id + '", in the specified time range.');
				return;
			}
			
			// any new hostnames?  If so, they need to be assigned entries in hosts array, 
			// and new graphs created
			var new_hostnames = [];
			for (var hostname in data.hostnames) {
				if (!(hostname in self.hostnames)) new_hostnames.push(hostname);
			}
			
			var dead_hostnames = [];
			for (var hostname in self.hostnames) {
				if (!(hostname in data.hostnames)) {
					// only drop host if data is stale
					var host = find_object( self.hosts, { hostname: hostname } );
					if (!host || !host.rows || !host.rows.length || (host.rows[ host.rows.length - 1 ].date < self.range_min / 1000)) {
						dead_hostnames.push( hostname );
					}
				}
			}
			
			if (dead_hostnames.length) {
				dead_hostnames.forEach( function(hostname) {
					Debug.trace("Removing dead host from group: " + hostname);
					
					var host_idx = find_object_idx( self.hosts, { hostname: hostname } );
					if (host_idx > -1) {
						self.hosts.splice( host_idx, 1 );
						delete self.hostnames[hostname];
						delete app.recent_hostnames[hostname];
					}
					
					// save death time in RAM cache to prevent reappearance
					// (this can happen on focus refresh, because contrib data lags behind a bit)
					self.rec_dead[hostname] = time_now();
				});
				
				// renumber remaining hosts to remove any idx gaps
				self.hosts.forEach( function(host, idx) {
					host.idx = idx;
				});
			} // dead removed
			
			if (new_hostnames.length) {
				new_hostnames.forEach( function(hostname) {
					if (self.rec_dead[hostname] && ((time_now() - self.rec_dead[hostname]) < 3600)) {
						// skip adding this host again, until it has been dead for 1+ hr
						return;
					}
					
					Debug.trace("Adding new host to group: " + hostname);
					
					var new_idx = self.hosts.length;
					self.hosts.push({ hostname: hostname, idx: new_idx });
					self.hostnames[hostname] = data.hostnames[hostname];
					app.recent_hostnames[hostname] = data.hostnames[hostname];
				}); // foreach new hostname
			} // new added
			
			if (new_hostnames.length || dead_hostnames.length) {
				// rebuild "jump to server" menu with new hosts
				app.initJumpMenus();
				
				// destroy and recreate all graphs as quickly as possible
				for (var key in self.graphs) {
					self.graphs[key].destroy();
				}
				self.createGraphs();
				
				self.div.find('div.graph_container').addClass('dirty');
				self.onScrollDebounce(true); // instant (bypass queue)
			} // new hosts added
			
			// now fetch data updates from all servers in parallel
			self.expecting = self.hosts.length;
			self.hosts.forEach( function(host) {
				var hostname = host.hostname;
				var server_args = merge_objects(args, overrides);
				server_args.hostname = hostname;
				
				app.api.get( 'app/view', server_args, self.receiveUpdate.bind(self), function(err) {
					Debug.trace('api', "API Error for " + hostname + ": " + err.description);
					
					self.expecting--;
					if (!self.expecting) {
						// welp, that was the final server we were waiting for, so trigger graph redraw now
						self.div.find('div.graph_container').addClass('dirty');
						self.onScrollDebounce();
						self.updateInfo();
						self.updateDataRangeDisplay();
					}
				} );
			});
			
			// merge hosts with recent and redraw jump menu
			app.updateRecentHostnames( data.hostnames );
		}, 
		function(err) {
			self.doInlineError( "Server Error", err.description );
		} );
	},
	
	onSecond30: function(dargs) {
		// update graphs on the :30s, but only in realtime view
		var args = this.args;
		
		/*if (this.isRealTime() && (app.getPref('auto_refresh') == '1')) {
			this.updateGroupData({ offset: -2, length: 2 });
		}*/
		this.onFocus();
	},
	
	onFocus: function() {
		// window received focus, update data
		var args = this.args;
		
		if (this.isRealTime() && (app.getPref('auto_refresh') == '1') && this.lastUpdate) {
			// only request the data we actually need
			var now = time_now();
			var minutes_lost = Math.floor((now - this.lastUpdate) / 60) + 1;
			if (minutes_lost < args.length) this.updateGroupData({ offset: 0 - minutes_lost, length: minutes_lost });
			else this.updateGroupData();
		}
	},
	
	receiveUpdate: function(data) {
		// receive update from server
		// data: { code, hostname, rows, metadata }
		var self = this;
		var rows = data.rows;
		var metadata = data.metadata;
		var args = this.args;
		
		if (!rows.length) {
			Debug.trace("No rows found in update: " + data.hostname);
		}
		
		// find matching host object so we can store stuff in it
		var host = find_object( this.hosts, { hostname: data.hostname } );
		if (!host) return app.doError("Hostname not found: " + data.hostname); // should never happen
		if (!host.rows) host.rows = [];
		host.metadata = data.metadata;
		
		// skip dupes
		var new_rows = [];
		rows.forEach( function(row) {
			if (!find_object(host.rows, { date: row.date })) new_rows.push(row);
		});
		rows = new_rows;
		
		if (!rows.length) {
			Debug.trace("All rows were dupes in update: " + data.hostname);
		}
		else {
			// data comes in as totals (may be more than one sample per timestamp), so pre-average everything
			rows.forEach( function(row) {
				for (var key in row.totals) {
					row.totals[key] /= row.count || 1;
				}
				host.rows.push( row );
			});
			
			// sort just in case
			host.rows = host.rows.sort( function(a, b) {
				return (a.date - b.date);
			});
			
			// discard old if beyond length
			while (host.rows.length > args.length) host.rows.shift();
		}
		
		// trigger visible graph redraw (also happens on debounced scroll)
		// only if all servers have reported in
		self.expecting--;
		if (!self.expecting) {
			// welp, that was the final server we were waiting for, so trigger graph redraw now
			self.div.find('div.graph_container').addClass('dirty');
			self.onScrollDebounce();
			self.updateInfo();
			self.updateDataRangeDisplay();
		}
	},
	
	getNiceHostname: function(hostname, idx) {
		// get formatted hostname with icon, plus optional link
		var width = 500;
		var link = true;
		var color = this.graphColors[ idx % this.graphColors.length ];
		if (!hostname) return '(None)';
		
		var query = { hostname: hostname };
		if (this.args && this.args.sys) query.sys = this.args.sys;
		if (this.args && this.args.date) query.date = this.args.date;
		if (this.args && ('offset' in this.args)) query.offset = this.args.offset;
		if (this.args && this.args.length) query.length = this.args.length;
		
		var html = '<div class="ellip" style="max-width:' + width + 'px;">';
		var icon = '<i class="mdi mdi-circle" style="color:' + color + '">&nbsp;</i>';
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
	
	updateInfo: function() {
		// update group alerts and info
		var self = this;
		
		// gather alerts in realtime mode
		var all_alerts = [];
		this.hosts.forEach( function(host) {
			var metadata = host.metadata || {};
			if (metadata.alerts) {
				for (var alert_id in metadata.alerts) {
					all_alerts.push( 
						merge_objects( metadata.alerts[alert_id], { 
							id: alert_id, 
							hostname: host.hostname 
						} )
					);
				} // foreach alert
			} // has alerts
		}); // foreach host
		
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
				html += '<th>Actions</th>';
			html += '</tr>';
			
			all_alerts.forEach( function(alert) {
				var alert_def = find_object( config.alerts, { id: alert.id } ) || { 
					id: alert.id,
					title: '(' + alert.id + ')',
					expression: 'n/a'
				};
				var host = find_object( self.hosts, { hostname: alert.hostname } ) || { idx: 0 };
				html += '<tr>';
				html += '<td><b>' + self.getNiceAlert(alert_def, true) + '</b></td>';
				html += '<td>' + self.getNiceHostname(alert.hostname, host.idx) + '</td>';
				html += '<td>' + alert.message + '</td>';
				html += '<td style="font-family:monospace">' + alert_def.expression + '</pre></td>';
				html += '<td>' + get_nice_date_time( alert.date ) + '</td>';
				
				var snap_id = alert.hostname + '/' + Math.floor( alert.date / 60 );
				html += '<td><a href="#Snapshot?id=' + snap_id + '">View&nbsp;Snapshot</a></td>';
				
				html += '</tr>';
			});
			
			html += '</table>';
			this.div.find('#fs_group_alerts').empty().html(html).show();
		}
		else {
			// no alerts, hide entire fieldset
			this.div.find('#fs_group_alerts').empty().hide();
		}
		
		// any filter at all hides info fieldset
		if (app.monitorFilter) {
			this.div.find('#fs_group_info').empty().hide();
			return;
		}
		
		// group info table: fs_group_info
		var extra_server_info = config.extra_server_info;
		var html = '';
		// html += '<legend>' + this.group.title +'</legend>';
		html += '<legend>Group Members</legend>';
		html += '<table class="fieldset_table" width="100%">';
		html += '<tr>';
			html += '<th>Hostname</th>';
			html += '<th>IP Address</th>';
			// html += '<th>Load Avg</th>';
			html += '<th>CPUs</th>';
			html += '<th>Total RAM</th>';
			html += '<th>Operating System</th>';
			html += '<th>' + extra_server_info.title + '</th>';
			html += '<th>Uptime</th>';
			// html += '<th>Alerts</th>';
		html += '</tr>';
		
		this.hosts.forEach( function(host) {
			var metadata = host.metadata || { data: { memory: {}, os: {} } };
			var nice_os = 'n/a';
			if (metadata.data.os.distro) {
				nice_os = metadata.data.os.distro + ' ' + metadata.data.os.release; //  + ' (' + metadata.data.os.arch + ')';
			}
			var nice_kernel = 'n/a';
			if (extra_server_info.source) {
				nice_kernel = substitute(extra_server_info.source, metadata.data, false);
			}
			var is_stale = false;
			if (self.isRealTime() && host.rows && host.rows.length) {
				var row = host.rows[ host.rows.length - 1 ];
				if (row.date < time_now() - 600) is_stale = true;
			}
			
			html += '<tr ' + (is_stale ? 'class="disabled"' : '') + '>';
			html += '<td><b>' + self.getNiceHostname(host.hostname, host.idx) + '</b></td>';
			html += '<td>' + (metadata.ip || 'n/a') + '</td>';
			html += '<td>' + (metadata.data.cpu ? metadata.data.cpu.cores : 0) + '</td>';
			html += '<td>' + get_text_from_bytes(metadata.data.memory.total || 0) + '</td>';
			html += '<td>' + nice_os + '</td>';
			html += '<td>' + nice_kernel + '</td>';
			html += '<td>' + get_text_from_seconds(metadata.data.uptime_sec || 0, false, true) + '</td>';
			html += '</tr>';
		});
		
		this.div.find('#fs_group_info').empty().html(html).show();
	},
	
	mergeMultiSeries: function(mon_id, series) {
		// merge multi-series into single using min/max/avg/total
		var mon_def = find_object( this.monitors, { id: mon_id } );
		var merge_type = app.getPref('ggt_' + mon_id);
		var time_index = {};
		
		series.forEach( function(dataset) {
			dataset.data.forEach( function(row) {
				if (!time_index[row.x]) {
					time_index[row.x] = { 
						x: row.x,
						total: row.y, 
						count: 1, 
						min: row.y, 
						max: row.y
					};
				}
				else {
					time_index[row.x].total += row.y;
					time_index[row.x].count++;
					if (row.y < time_index[row.x].min) time_index[row.x].min = row.y;
					if (row.y > time_index[row.x].max) time_index[row.x].max = row.y;
				}
			} );
		} );
		
		var rows = [];
		var sorted_times = hash_keys_to_array(time_index).sort( function(a, b) {
			return parseInt(a) - parseInt(b);
		});
		
		sorted_times.forEach( function(key) {
			var row = time_index[key];
			switch (merge_type) {
				case 'avg': 
					var avg = row.total / row.count;
					if (mon_def.data_type.match(/(integer|bytes|seconds|milliseconds)/)) avg = Math.floor(avg);
					rows.push({ x: row.x, y: avg }); 
				break;
				case 'total': rows.push({ x: row.x, y: row.total }); break;
				case 'min': rows.push({ x: row.x, y: row.min }); break;
				case 'max': rows.push({ x: row.x, y: row.max }); break;
			}
		});
		
		return [{
			name: ucfirst( merge_type.replace(/avg/, 'average') ),
			data: rows
		}];
	},
	
	changeMergeType: function(elem) {
		// change graph merge type (from menu click)
		var self = this;
		var $elem = $(elem);
		var args = this.args;
		var $cont = $elem.closest('div.graph_container');
		var mon_id = $cont.data('mon');
		var mon_def = find_object( this.monitors, { id: mon_id } );
		var mon_idx = find_object_idx( this.monitors, { id: mon_id } );
		var graph = this.graphs[mon_id];
		
		var merge_type = $elem.val();
		app.setPref('ggt_' + mon_id, merge_type);
		
		// update settings
		var settings = this.graphSettings[mon_id];
		if (merge_type) {
			// convert to merge (single layer)
			settings.title = ucfirst(merge_type) + " " + mon_def.title;
			settings.labels = [ ucfirst(merge_type.replace(/avg/, 'average')) ];
			settings.color = this.graphColors[ mon_idx % this.graphColors.length ];
			settings.num_layers = 1;
			settings.no_fill = false;
			settings.show_legend = false;
		}
		else {
			// convert back to multi-line
			settings.title = mon_def.title;
			settings.labels = [];
			delete settings.color;
			settings.num_layers = this.hosts.length;
			settings.no_fill = true;
			settings.show_legend = true;
		}
		
		// redraw graph
		graph.destroy();
		this.graphs[mon_id] = this.createGraph(settings);
		this.updateGraph(mon_id);
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
			var $cont = self.div.find('#d_graph_group_' + mon_def.id);
			
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
	
	editGroupWatch: function() {
		// open group watch dialog
		var self = this;
		var args = this.args;
		var html = '';
		var watch_sel = 0;
		var state = config.state;
		var hostnames = this.hosts.map( function(host) { return host.hostname; } );
		
		var watch_items = [
			[0, "(Disable Watch)"],
			app.getTimeMenuItem( 60 ),
			app.getTimeMenuItem( 60 * 5 ),
			app.getTimeMenuItem( 60 * 10 ),
			app.getTimeMenuItem( 60 * 15 ),
			app.getTimeMenuItem( 60 * 30 ),
			app.getTimeMenuItem( 60 * 45 ),
			app.getTimeMenuItem( 3600 ),
			app.getTimeMenuItem( 3600 * 2 ),
			app.getTimeMenuItem( 3600 * 3 ),
			app.getTimeMenuItem( 3600 * 6 ),
			app.getTimeMenuItem( 3600 * 12 ),
			app.getTimeMenuItem( 86400 ),
			app.getTimeMenuItem( 86400 * 2 ),
			app.getTimeMenuItem( 86400 * 3 ),
			app.getTimeMenuItem( 86400 * 7 ),
			app.getTimeMenuItem( 86400 * 15 ),
			app.getTimeMenuItem( 86400 * 30 )
		];
		
		html += '<div style="font-size:12px; margin-bottom:20px;">Use the menu below to optionally set watch timers <b>on all current servers in the group</b>.  This will generate snapshots every minute until the timer expires.</div>';
		watch_sel = 3600;
		
		html += '<center><table>' + 
			// get_form_table_spacer() + 
			get_form_table_row('Watch For:', '<select id="fe_watch_time">' + render_menu_options(watch_items, watch_sel) + '</select>') + 
			get_form_table_caption("Select the duration for the group watch.") + 
		'</table></center>';
		
		app.confirm( '<i class="mdi mdi-eye">&nbsp;</i>Watch Group', html, "Set Watch", function(result) {
			app.clearError();
			
			if (result) {
				var watch_time = parseInt( $('#fe_watch_time').val() );
				var watch_date = time_now() + watch_time;
				Dialog.hide();
				
				app.api.post( 'app/watch', { hostnames: hostnames, date: watch_date }, function(resp) {
					// update local state and show message
					if (!state.watches) state.watches = {};
					
					if (watch_time) {
						app.showMessage('success', "Group will be watched for " + get_text_from_seconds(watch_time, false, true) + ".");
						hostnames.forEach( function(hostname) {
							state.watches[ hostname ] = watch_date;
						});
					}
					else {
						app.showMessage('success', "Group watch has been disabled.");
						hostnames.forEach( function(hostname) {
							delete state.watches[ hostname ];
						});
					}
					
				} ); // api.post
			} // user clicked set
		} ); // app.confirm
	},
	
	takeSnapshot: function() {
		// take a snapshot (i.e. 1 minute watch)
		var self = this;
		var args = this.args;
		var state = config.state;
		var watch_time = 60;
		var watch_date = time_now() + watch_time;
		// var hostnames = this.hosts.map( function(host) { return host.hostname; } );
		
		var hostnames = [];
		this.hosts.forEach( function(host) {
			var is_stale = false;
			if (self.isRealTime() && host.rows && host.rows.length) {
				var row = host.rows[ host.rows.length - 1 ];
				if (row.date < time_now() - 600) is_stale = true;
			}
			if (!is_stale) hostnames.push( host.hostname );
		});
		if (!hostnames.length) return app.doError("Snapshots are not possible, as all servers in the group have gone stale (offline).");
		
		app.api.post( 'app/watch', { hostnames: hostnames, date: watch_date }, function(resp) {
			// update local state and show message
			if (!state.watches) state.watches = {};
			app.showMessage('success', 'Your snapshot(s) will be taken within a minute, and appear on the <a href="#Snapshot">Snapshots</a> tab.');
			hostnames.forEach( function(hostname) {
				state.watches[ hostname ] = watch_date;
			});
		} ); // api.post
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
		this.queue = [];
		if (this.queueTimer) clearTimeout( this.queueTimer );
		this.hostnames = null;
		this.hosts = null;
		this.graphs = null;
		this.rec_dead = null;
		this.div.html( '' );
		return true;
	}
	
} );
