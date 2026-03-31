import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..", "..", "..");
const generatedApiPath = path.join(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);

const helperAnchor =
  'type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];';
const helperBlock = `${helperAnchor}

type QueryOptionsInput<TQueryFnData, TError, TData> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData>,
  "queryKey" | "queryFn"
>;`;

const queryOptionsPattern =
  /query\?: UseQueryOptions<\n(\s+)([\s\S]*?)\n\1>;/g;

async function main() {
  let source = await fs.readFile(generatedApiPath, "utf8");

  if (!source.includes("type QueryOptionsInput<")) {
    source = source.replace(helperAnchor, helperBlock);
  }

  source = source.replace(queryOptionsPattern, (_match, indent, typeArgs) => {
    return `query?: QueryOptionsInput<\n${indent}${typeArgs}\n${indent}>;`;
  });

  await fs.writeFile(generatedApiPath, source);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
