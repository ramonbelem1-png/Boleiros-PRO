const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'LiveMatch.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find occurrences of handleRemovePlayerFromTeam(id)
// The first one is Team A, the second is Team B, the third is static editing.
let index = 0;
content = content.replace(/onClick=\{\(\) => handleRemovePlayerFromTeam\(id\)\}/g, (match) => {
  index++;
  if (index === 1) {
    // Team A
    return `onClick={() => {
                                  if (editingGame && editingGame.status === 'RUNNING') {
                                    handleRemovePlayerFromRunningGame(id, 'A');
                                  } else {
                                    handleRemovePlayerFromTeam(id);
                                  }
                                }}`;
  } else if (index === 2) {
    // Team B
    return `onClick={() => {
                                  if (editingGame && editingGame.status === 'RUNNING') {
                                    handleRemovePlayerFromRunningGame(id, 'B');
                                  } else {
                                    handleRemovePlayerFromTeam(id);
                                  }
                                }}`;
  }
  // Leave other occurrences (like static editing) unchanged
  return match;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated LiveMatch.tsx trash handlers!');
