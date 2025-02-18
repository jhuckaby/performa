// Performa Auto Installer
// Copyright (c) 2019 - 2025 Joseph Huckaby, MIT License.
// https://github.com/jhuckaby/performa

// To install, issue this command as root:
// curl -s "https://raw.githubusercontent.com/jhuckaby/performa/master/bin/install.js" | node

var path = require('path');
var fs = require('fs');
var util = require('util');
var os = require('os');
var cp = require('child_process');

var installer_version = '1.2';
var base_dir = '/opt/performa';
var log_dir = base_dir + '/logs';
var log_file = '';
var gh_repo_url = 'http://github.com/jhuckaby/performa';
var gh_releases_url = 'https://api.github.com/repos/jhuckaby/performa/releases';
var gh_head_tarball_url = 'https://github.com/jhuckaby/performa/archive/master.tar.gz';

// Check if Node.js version is old
if (process.version.match(/^v?(\d+)/) && (parseInt(RegExp.$1) < 16) && !process.env['PERFORMA_OLD']) {
	console.error("\nERROR: You are using an incompatible version of Node.js (" + process.version + ").  Please upgrade to v16 or later.  Instructions: https://nodejs.org/en/download/\n\nTo ignore this error and run unsafely, set an PERFORMA_OLD environment variable.  Do this at your own risk.\n");
	process.exit(1);
}

// Error out if we have low memory
if ((os.totalmem() < 64 * 1024 * 1024) && !process.env['PERFORMA_DANGER']) {
	console.error("\nERROR: The current machine has less than 64 MB of total RAM.  Performa will likely fail to install successfully under such low memory conditions.\n\nTo ignore this error and attempt the install anyway, set a PERFORMA_DANGER environment variable.  Do this at your own risk.\n");
	process.exit(1);
}

// make sure we have NPM available
try { cp.execSync('which npm'); }
catch (err) {
	console.error("\nERROR: NPM cannot be found.  Performa requires both Node.js and NPM to be preinstalled.  Instructions: https://nodejs.org/en/download/\n");
	process.exit(1);
}

var print = function(msg) { 
	process.stdout.write(msg); 
	if (log_file) fs.appendFileSync(log_file, msg);
};
var warn = function(msg) { 
	process.stderr.write(msg); 
	if (log_file) fs.appendFileSync(log_file, msg);
};
var die = function(msg) {
	warn( "\nERROR: " + msg.trim() + "\n\n" );
	process.exit(1);
};
var logonly = function(msg) {
	if (log_file) fs.appendFileSync(log_file, msg);
};

if (process.getuid() != 0) {
	die( "The Performa auto-installer must be run as root." );
}

// create base and log directories
try { cp.execSync( "mkdir -p " + base_dir + " && chmod 775 " + base_dir ); }
catch (err) { die("Failed to create base directory: " + base_dir + ": " + err); }

try { cp.execSync( "mkdir -p " + log_dir + " && chmod 777 " + log_dir ); }
catch (err) { die("Failed to create log directory: " + log_dir + ": " + err); }

// start logging from this point onward
log_file = log_dir + '/install.log';
logonly( "\nStarting install run: " + (new Date()).toString() + "\n" );

print( 
	"\nPerforma Installer v" + installer_version + "\n" + 
	"Copyright (c) 2019 PixlCore.com. MIT Licensed.\n" + 
	"Log File: " + log_file + "\n\n" 
);

process.chdir( base_dir );

var is_preinstalled = false;
var cur_version = '';
var new_version = process.argv[2] || '';

try {
	var stats = fs.statSync( base_dir + '/package.json' );
	var json = require( base_dir + '/package.json' );
	if (json && json.version) {
		cur_version = json.version;
		is_preinstalled = true;
	}
}
catch (err) {;}

var is_running = false;
if (is_preinstalled) {
	var pid_file = log_dir + '/performa.pid';
	try {
		var pid = fs.readFileSync(pid_file, { encoding: 'utf8' });
		is_running = process.kill( pid, 0 );
	}
	catch (err) {;}
}

print( "Fetching release list...\n");
logonly( "Releases URL: " + gh_releases_url + "\n" );

cp.exec('curl -s ' + gh_releases_url, function (err, stdout, stderr) {
	if (err) {
		print( stdout.toString() );
		warn( stderr.toString() );
		die("Failed to fetch release list: " + gh_releases_url + ": " + err);
	}
	
	var releases = null;
	try { releases = JSON.parse( stdout.toString() ); }
	catch (err) {
		die("Failed to parse JSON from GitHub: " + gh_releases_url + ": " + err);
	}
	
	// util.isArray is DEPRECATED??? Nooooooooode!
	var isArray = Array.isArray || util.isArray;
	if (!isArray(releases)) die("Unexpected response from GitHub Releases API: " + gh_releases_url + ": Not an array");
	
	var release = null;
	for (var idx = 0, len = releases.length; idx < len; idx++) {
		var rel = releases[idx];
		var ver = rel.tag_name.replace(/^\D+/, '');
		rel.version = ver;
		
		if (!new_version || (ver == new_version)) { 
			release = rel; 
			new_version = ver; 
			idx = len; 
		}
	} // foreach release
	
	if (!release) {
		// no release found -- use HEAD rev?
		if (!new_version || new_version.match(/HEAD/i)) {
			release = {
				version: 'HEAD',
				tarball_url: gh_head_tarball_url
			};
		}
		else {
			die("Release not found: " + new_version);
		}
	}
	
	// sanity check
	if (is_preinstalled && (cur_version == new_version)) {
		if (process.argv[2]) print( "\nVersion " + cur_version + " is already installed.\n\n" );
		else print( "\nVersion " + cur_version + " is already installed, and is the latest.\n\n" );
		process.exit(0);
	}
	
	// proceed with installation
	if (is_preinstalled) print("Upgrading Performa from v"+cur_version+" to v"+new_version+"...\n");
	else print("Installing Performa v"+new_version+"...\n");
	
	if (is_running) {
		print("\n");
		try { cp.execSync( base_dir + "/bin/control.sh stop", { stdio: 'inherit' } ); }
		catch (err) { die("Failed to stop Performa: " + err); }
		print("\n");
	}
	
	// download tarball and expand into current directory
	var tarball_url = release.tarball_url;
	logonly( "Tarball URL: " + tarball_url + "\n" );
	
	cp.exec('curl -L ' + tarball_url + ' | tar zxf - --strip-components 1', function (err, stdout, stderr) {
		if (err) {
			print( stdout.toString() );
			warn( stderr.toString() );
			die("Failed to download release: " + tarball_url + ": " + err);
		}
		else {
			logonly( stdout.toString() + stderr.toString() );
		}
		
		try {
			var stats = fs.statSync( base_dir + '/package.json' );
			var json = require( base_dir + '/package.json' );
		}
		catch (err) {
			die("Failed to download package: " + tarball_url + ": " + err);
		}
		
		print( is_preinstalled ? "Updating dependencies...\n" : "Installing dependencies...\n");
		
		var npm_cmd = is_preinstalled ? "npm update --unsafe-perm" : "npm install --unsafe-perm --production";
		logonly( "Executing command: " + npm_cmd + "\n" );
		
		// install dependencies via npm
		cp.exec(npm_cmd, function (err, stdout, stderr) {
			if (err) {
				print( stdout.toString() );
				warn( stderr.toString() );
				die("Failed to install dependencies: " + err);
			}
			else {
				logonly( stdout.toString() + stderr.toString() );
			}
			
			print("Running post-install script...\n");
			logonly( "Executing command: node bin/build.js dist\n" );
			
			// finally, run postinstall script
			cp.exec('node bin/build.js dist', function (err, stdout, stderr) {
				if (is_preinstalled) {
					// for upgrades only print output on error
					if (err) {
						print( stdout.toString() );
						warn( stderr.toString() );
						die("Failed to run post-install: " + err);
					}
					else {
						print("Upgrade complete.\n\n");
						
						if (is_running) {
							try { cp.execSync( base_dir + "/bin/control.sh start", { stdio: 'inherit' } ); }
							catch (err) { die("Failed to start Performa: " + err); }
							print("\n");
						}
					}
				} // upgrade
				else {
					// first time install, always print output
					print( stdout.toString() );
					warn( stderr.toString() );
					
					if (err) {
						die("Failed to run post-install: " + err);
					}
					else {
						print("Installation complete.\n\n");
					}
				} // first install
				
				logonly( "Completed install run: " + (new Date()).toString() + "\n" );
				
				process.exit(0);
			} ); // build.js
		} ); // npm
	} ); // download
} ); // releases api
