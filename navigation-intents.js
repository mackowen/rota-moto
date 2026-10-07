'use strict';
(function(root){
  function point(value){
    const lat=Number(value?.lat),lon=Number(value?.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new TypeError('Valid coordinates are required.');
    return `${lat.toFixed(6)},${lon.toFixed(6)}`;
  }
  function osmandGeoUri(value){return `geo:0,0?q=${encodeURIComponent(point(value))}`;}
  function googleDirectionsUrl(points){
    if(!Array.isArray(points)||!points.length)throw new TypeError('At least one coordinate is required.');
    const url=new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api','1');url.searchParams.set('destination',point(points.at(-1)));url.searchParams.set('travelmode','driving');
    if(points.length>1)url.searchParams.set('waypoints',points.slice(0,-1).map(point).join('|'));
    return url.toString();
  }
  function wazeUrl(value){const url=new URL('https://waze.com/ul');url.searchParams.set('ll',point(value));url.searchParams.set('navigate','yes');return url.toString();}
  root.RotaMotoNavigation=Object.freeze({point,osmandGeoUri,googleDirectionsUrl,wazeUrl});
  if(typeof module==='object'&&module.exports)module.exports=root.RotaMotoNavigation;
})(typeof globalThis==='object'?globalThis:this);
