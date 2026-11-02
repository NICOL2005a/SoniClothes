// Aprovisionamiento local de confianza. Nunca se expone como registro público.
const readline=require('node:readline');
const {Writable}=require('node:stream');
const db=require('./base');const {hashPassword}=require('./acceso');
let hidden=false;
const output=new Writable({write(chunk,enc,done){if(!hidden)process.stdout.write(chunk);done();}});
const rl=readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
const ask=question=>new Promise(resolve=>rl.question(question,resolve));
let conectado=false;
(async()=>{try{
 const nombre=(await ask('Tu nombre: ')).trim();
 const usuario=(await ask('Nombre de usuario administrador (3 a 60 caracteres): ')).trim();
 const correo=(await ask('Correo: ')).trim().toLowerCase();
 process.stdout.write('Contraseña nueva (mínimo 12 caracteres): ');hidden=true;const password=await ask('');hidden=false;process.stdout.write('\n');
 process.stdout.write('Confirma la contraseña: ');hidden=true;const confirm=await ask('');hidden=false;process.stdout.write('\n');
 if(!nombre||nombre.length>120||!/^[a-zA-Z0-9._-]{3,60}$/.test(usuario)||!/^\S+@\S+\.\S+$/.test(correo)||correo.length>190||password.length<12||password.length>128||password!==confirm)throw Error('Datos inválidos o contraseñas distintas. No se creó ninguna cuenta.');
 await db.iniciar();conectado=true;
 await db.query("INSERT INTO usuario(nombre,nombre_usuario,correo,hash_contrasena,rol) VALUES($1,$2,$3,$4,'administrador')",[nombre,usuario,correo,await hashPassword(password)]);
 console.log('Tu cuenta administradora quedó creada. Ya puedes entrar y revisar las solicitudes.');
 await db.cerrar();conectado=false;
}catch(e){console.error(e.code==='23505'?'Ese usuario o correo ya existe. Elige otros datos.':e.message);process.exitCode=1;}finally{rl.close();if(conectado)await db.cerrar();}})();
