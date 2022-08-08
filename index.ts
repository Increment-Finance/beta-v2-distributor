import { readFileSync, writeFileSync } from "fs";
import { Signer, Wallet, providers, BigNumberish, BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import axios from "axios";
import "dotenv/config";

import { Disperse__factory, ERC20__factory } from "./typechain";

const DISPERSE_ADDRESS = "0xB430EC1e046005957e19293b838DCD1Cd1a83f9a";
const TOKEN_ADDRESS = "0xc13e4205390eD4a9b07E109373420A03551d34F1";
const TOKEN_AMOUNT = parseUnits("100", 18);
const RPC_URL = "https://zksync2-testnet.zksync.dev";
const STORAGE_FILE = "./DISTRIBUTIONS.csv";
const GUILD = "increment";
const ROLE_ID = 9494;

const MAX_UINT_256 = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

interface GuildRole {
  id: number;
  members: string[];
}

const addressRegex = /0x[a-fA-F0-9]{40}/g;

async function ensureApproved(
  amount: BigNumberish,
  signer: Signer
): Promise<void> {
  const sender = await signer.getAddress();
  const token = ERC20__factory.connect(TOKEN_ADDRESS, signer);
  console.log("Checking allowance");
  const allowance = await token.allowance(sender, DISPERSE_ADDRESS);
  const balance = await token.balanceOf(sender);
  console.log(
    "Allowance: ",
    allowance.toString(),
    "\nAmount: ",
    BigNumber.from(amount).toString(),
    "\nBalance: ",
    balance.toString()
  );

  // Approve All
  if (allowance.lt(amount)) {
    console.log("Approving Disperse Contract to spend max uint256 tokens...");
    const tx = await token.approve(DISPERSE_ADDRESS, MAX_UINT_256);
    const receipt = await tx.wait();
    console.log("Tokens approved in tx: ", receipt.transactionHash);
  }
}

async function getGuildList(guild: string, roleId: number): Promise<string[]> {
  const response = await axios
    .get(`https://api.guild.xyz/v1/guild/${guild}`)
    .then((response) => {
      return response.data as { roles: GuildRole[] };
    });
  const role = response.roles.find((role: GuildRole) => role.id === roleId);
  return role?.members ?? [];
}

function getStoredList(): [string[], string] {
  let rawText: string = "";
  try {
    rawText = readFileSync(STORAGE_FILE, "utf8");
    return [rawText.match(addressRegex) ?? [], rawText];
  } catch (err) {
    console.warn(err);
    if (rawText !== "") {
      console.warn("WARN: No distribution file found, using empty array");
      return [[], rawText];
    }
  }
  return [[], ""];
}

function setStoredList(oldList: string, txHash: string, addresses: string[]) {
  if (addresses.length > 0) {
    const content = `${oldList}${addresses
      .toString()
      .replace(/[\"\s]/g, "")
      .replace(/[\,]/g, `,${txHash}\n`)},${txHash}\n`;
    writeFileSync(STORAGE_FILE, content);
  }
}

async function disperseTokens(signer: Signer, recipients: string[]) {
  const disperse = Disperse__factory.connect(DISPERSE_ADDRESS, signer);
  console.log("Dispersing tokens...");
  const tx = await disperse.disperseToken(
    TOKEN_ADDRESS,
    recipients,
    Array(recipients.length).fill(TOKEN_AMOUNT)
  );
  const { transactionHash } = await tx.wait();
  console.log("Tokens dispersed in tx:", transactionHash);
  return transactionHash;
}

async function main(): Promise<void> {
  const mnemonic: string = process.env.MNEMONIC ?? "";
  if (mnemonic === "")
    throw new Error("Error: No mnemonic found in environment variables");

  // Get list of Users who haven't gotten distributions yet
  const guildList = await getGuildList(GUILD, ROLE_ID);
  const [storedList, rawText] = getStoredList();
  if (!storedList || !rawText) {
    console.error(`Error: Could not read stored list from ${STORAGE_FILE}`);
  }
  const newUsers = [
    ...guildList.filter(
      (address: string) => storedList.indexOf(address) === -1
    ),
  ];

  // Disperse tokens
  let wallet = Wallet.fromMnemonic(mnemonic);
  const rpcProvider = new providers.JsonRpcProvider(RPC_URL);
  wallet = wallet.connect(rpcProvider);
  try {
    await ensureApproved(
      BigNumber.from(TOKEN_AMOUNT).mul(newUsers.length),
      wallet
    );
  } catch (err) {
    console.error("Failed to approve token " + TOKEN_ADDRESS, err);
  }
  if (newUsers.length > 0) {
    console.log({ newUsers });
    const txHash = await disperseTokens(wallet, newUsers);
    setStoredList(
      rawText,
      `https://zksync2-testnet.zkscan.io/tx/${txHash}`,
      newUsers
    );
  }
}

main().then(() => {
  console.log("Done");
});
