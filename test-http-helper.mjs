import {randomInt} from 'node:crypto';

export async function listenForHttpTests(server, firstPort=randomInt(20000,60000)) {
 if(!Number.isInteger(firstPort)||firstPort<20000||firstPort>=60000)throw Error('Invalid HTTP test port range');
 // Fetch blocks some system-assigned ports; allocate a high test port atomically.
 for(let offset=0;offset<32;offset++) {
  const port=20000+(firstPort-20000+offset)%40000;
  try {
   await new Promise((resolve,reject)=>{
    const cleanup=()=>{server.off('error',failed);server.off('listening',ready);};
    const ready=()=>{cleanup();resolve();},failed=error=>{cleanup();reject(error);};
    server.once('error',failed);server.once('listening',ready);
    try{server.listen({port,host:'127.0.0.1',exclusive:true});}catch(error){failed(error);}
   });
   return port;
  } catch(error) {if(error.code!=='EADDRINUSE')throw error;}
 }
 throw Error('No available HTTP test port in the reserved range');
}
