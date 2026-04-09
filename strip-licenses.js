import fs from 'fs';

let content = fs.readFileSync('index.html', 'utf8');

// Remove block comments containing the word "license"
content = content.replace(/\/\*[\s\S]*?license[\s\S]*?\*\//gi, '');

fs.writeFileSync('index.html', content);
console.log('Licenses removed!');
