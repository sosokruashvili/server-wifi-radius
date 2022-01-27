const dgram = require('dgram');
const server = dgram.createSocket('udp4');
var radius = require('radius');
const { Client } = require('pg');

var TOKEN, ACTIVITY_ID, SESSION_DURATION, RINFO, HOTSPOT_MAC, packet;
var LOG = true; 

const connection = new Client({
	user: 'wifidbuser',
	host: '10.1.115.14',
	database: 'wifi',
	password: '2oca2Host',
	port: 5432,
});

connection.connect(function(err) {
	if (err) throw err;
});

server.on('error', (err) => {
	console.log('Server Error');
	console.log('server error:\n${err.stack}');
	server.close();
});

server.on('message', (msg, rinfo) => {
	RINFO = rinfo;
	try {
	  packet = radius.decode_without_secret({packet: msg});
	} catch (e) {
	  console.log("Failed to decode radius packet, silently dropping:", e);
	  return;
	}

	if (packet.code != 'Access-Request') {
	  console.log('unknown packet type: ', packet.code);
	  return;
	}
  
	username_str = packet.attributes['User-Name'];
	HOTSPOT_MAC = packet.attributes['Called-Station-Id'].replace(new RegExp('-', 'g'), ':');
	var mac_array = HOTSPOT_MAC.split(':');
	mac_array = mac_array.slice(0, 6);
	HOTSPOT_MAC = mac_array.join(":");
	TOKEN = username_str.split('@')[1];
	
	//console.log('Password: ' + TOKEN);
	//console.log('Hotspot Mac: ' + HOTSPOT_MAC);
	//console.log('Username: '+username_str);

	//connection.query("select api.wifivendor from hotspot INNER JOIN api on api.id = hotspot.api_id where hotspot.macaddress = '"+HOTSPOT_MAC.toLowerCase()+"'", function (err, result) {
	//	console.log(result.rows[0].wifivendor);
	//});

	if(LOG === true) {
		console.log('Access-Request for ' + username_str);
	}
	
	connection.query("select * from session where token = '" + TOKEN + "'", function (err, result) {
		if (err) throw err;
		if( result.rowCount > 0 ) {
			SESSION_DURATION 		= result.rows[0].duration;
			ACTIVITY_ID 			= result.rows[0].activity_id;

		connection.query("update session set state=1 where token='" + TOKEN + "'", function() {
			connection.query("update activity set status=4 where id = " + ACTIVITY_ID + " and status < 4");
			if(LOG == true) {
				console.log('Access-Accept for ' + username_str);
				console.log('Session Duration: ' + SESSION_DURATION);
			}
			accept_client();
		});
			
		} else {
			if(LOG == true)
				console.log('Access-Reject for ' + username_str);
			reject_client();
		}
	});
});

server.bind(1812);

var accept_client = function() {
	var response = radius.encode_response({
		packet: packet,
		code: 'Access-Accept',
		secret: '123456',
		attributes: {
			'Session-Timeout': 	SESSION_DURATION
		}
	});

	server.send(response, 0, response.length, RINFO.port, RINFO.address, function(err, bytes) {
		if (err) {
			console.log('Error sending response to ', RINFO);
		}
	});
}

var reject_client = function() {
	var response = radius.encode_response({
    	packet: packet,
    	code: 'Access-Reject',
    	secret: '123456'
  	});
  	server.send(response, 0, response.length, RINFO.port, RINFO.address, function(err, bytes) {
    	if (err) {
      		console.log('Error sending response to ', RINFO);
		}
  	});
}