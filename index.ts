import { readFileSync, writeFileSync } from "fs";

const STORAGE_FILE = "./DISTRIBUTIONS.csv";
const GUILD = "increment";
const ROLE_ID = 9494;

interface GuildRole {
  id: number;
  members: string[];
}

const addressRegex = /0x[a-fA-F0-9]{40}/g;

async function getGuildList(guild: string, roleId: number): Promise<string[]> {
  const response: { roles: GuildRole[] } = await (
    await fetch(`https://api.guild.xyz/v1/guild/${guild}`)
  ).json();
  const role = response.roles.find((role: GuildRole) => role.id === roleId);
  return role.members;
}

function getStoredList(): string[] {
  try {
    const rawList: string = readFileSync(STORAGE_FILE, "utf8");
    return rawList.match(addressRegex);
  } catch (err) {
    console.warn("WARN: No distribution file found, using empty array");
    return [];
  }
}

function setStoredList(addresses: string[]) {
  const content = addresses
    .toString()
    .replace(/[\"\s]/g, "")
    .replace(/[\,]/g, ",\n");
  writeFileSync(STORAGE_FILE, content);
}

async function main(): Promise<void> {
  const guildList = await getGuildList(GUILD, ROLE_ID);
  const storedList = getStoredList();
  const newUsers = guildList.filter(
    (address: string) => storedList.indexOf(address) === -1
  );
  // TODO: send tokens to new users
  setStoredList(guildList);
}

main();
