const fs = require('fs');
const path = require('path');

const dirPath = path.join(__dirname, 'relay', 'src');
const excludeDirs = ['node_modules', '.git', 'radata', 'data', 'dist', 'build', '.Jules', '.cursor', 'coverage', 'public'];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        if (excludeDirs.includes(file)) return;
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            results.push(file);
        }
    });
    return results;
}

const files = walk(dirPath);

files.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.md')) {
        let content = fs.readFileSync(file, 'utf8');
        let newContent = content
            .replace(/gunInstance/g, 'zenInstance')
            .replace(/getGunInstance/g, 'getZenInstance')
            .replace(/getGunNode/g, 'getZenNode')
            .replace(/GUN_PATHS/g, 'ZEN_PATHS')
            .replace(/GunDB/g, 'Zen')
            .replace(/gun-paths/g, 'zen-paths')
            .replace(/gunStore/g, 'zenStore')
            .replace(/gun-storage-stats/g, 'zen-storage-stats')
            .replace(/GunStorageStats/g, 'ZenStorageStats')
            .replace(/getGunStorageStats/g, 'getZenStorageStats');
        
        if (content !== newContent) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
});
