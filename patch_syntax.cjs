const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

content = content.replace(
  `              </div>\n            ))\n          )}\n        </div>\n      ) : (() => {`,
  `              </div>\n            ))}\n            </div>\n          )}\n        </div>\n      ) : (() => {`
);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
