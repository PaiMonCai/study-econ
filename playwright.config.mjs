import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',fullyParallel:false,workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:18806',headless:true,trace:'retain-on-failure'},
 webServer:{command:'node serve.mjs',url:'http://127.0.0.1:18806/healthz',reuseExistingServer:false,env:{HOST:'127.0.0.1',PORT:'18806',BASE_PATH:'',STORAGE_MODE:'browser'}},
 projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],
});
