// Web Worker for generating a reliable heartbeat every second
var tickTimer = setInterval( function() {
	postMessage("tick");
}, 1000 );
