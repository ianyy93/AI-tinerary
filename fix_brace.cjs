const fs = require('fs');
let content = fs.readFileSync('src/components/hub/TripHub.tsx', 'utf8');

const targetStr = `    } catch (e: any) {
      console.error("Error creating trip:", e);
      setErrorMsg(e.message || 'Error creating trip');
    }
  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {`;

const replacementStr = `    } catch (e: any) {
      console.error("Error creating trip:", e);
      setErrorMsg(e.message || 'Error creating trip');
    }
  };
  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/hub/TripHub.tsx', content);
