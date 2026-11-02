const {spawn}=require('node:child_process');
const path=require('node:path');
const child=spawn(process.execPath,['servidor.js'],{cwd:__dirname,env:{...process.env,DB_MODE:'demo',SONICLOTHES_DEMO:'1',DEMO_DATA_DIR:path.join(__dirname,'.demo-data')},stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
process.on('SIGINT',()=>child.kill('SIGINT'));
