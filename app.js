/**
 * ZKWAConnect — GoDaddy / cPanel / Phusion Passenger Entry Point
 * By default, cPanel Node.js Selector looks for "app.js" as the startup file.
 * This file delegates directly to our standalone production server.js.
 */
require("./server.js");

