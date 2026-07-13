import { addServer } from "./_serverStore.js";

const initialServers = [
  { name: "FADE MASOUD", license: "2087413-DCWP", theiserverId: "2091185" },
  { name: "OSVALDO PERALTA", license: "2124122-DCWP", theiserverId: "2091347" },
  { name: "Mohamed Elazabawy", license: "2037672-DCA", theiserverId: "20911792" },
];

async function seed() {
  for (const server of initialServers) {
    try {
      const record = await addServer(server);
      console.log(`Added: ${record.name} (${record.theiserverId})`);
    } catch (err) {
      console.error(`Skipped ${server.name}: ${err.message}`);
    }
  }
  console.log("Seeding complete.");
}

seed();
