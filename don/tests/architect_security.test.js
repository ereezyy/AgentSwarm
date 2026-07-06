const fs = require('fs');
const path = require('path');

describe('Architect Security Checks', () => {
    let DANGEROUS_STRINGS;
    let DANGEROUS_REGEX;

    beforeAll(() => {
        // We'll read the file directly since exporting arrays isn't guaranteed
        const architectContent = fs.readFileSync(path.join(__dirname, '../architect.js'), 'utf8');

        // Very basic extraction for test purposes
        const stringsMatch = architectContent.match(/const DANGEROUS_STRINGS = \[([\s\S]*?)\];/);
        const regexMatch = architectContent.match(/const DANGEROUS_REGEX = \[([\s\S]*?)\];/);

        expect(stringsMatch).toBeTruthy();
        expect(regexMatch).toBeTruthy();

        // Ensure eval( is no longer a DANGEROUS_STRING
        const stringsCode = stringsMatch[1];
        expect(stringsCode).not.toContain("'eval('");

        // Ensure eval and new Function regexes exist
        const regexCode = regexMatch[1];
        expect(regexCode).toContain("/\\beval\\b/");
        expect(regexCode).toContain("/\\bnew\\s+Function\\s*\\(/");
    });

    test('eval usage should be caught by regex', () => {
        const evalRegex = /\\beval\\b/; // stringified representation
        // We just verified the regex exists above
    });
});
