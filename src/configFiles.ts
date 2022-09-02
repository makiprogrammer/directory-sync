import path from "node:path";
import fse from "fs-extra";
import { FileTree, UUID } from "./diffs";
const { version } = require("../package.json");

export interface DirsyncConfigFile {
	lastSyncDate: string;
	dirsyncVersion: string;
	thisDirUuid: string;
	// dirs: RootDirectory[];
	excludeFromSync: string[];
	skipSync: string[];
	// 	// TODO: maybe add presets for local drives, external backup drives, etc.
	// 	// TODO: ... and from that derive default behaviour
}

export const configFileName = "dirsync.config.json";

export function readConfigFiles(dirs: string[]) {
	return dirs
		.map(dir => path.join(dir, configFileName))
		.map(path =>
			fse.existsSync(path)
				? (JSON.parse(fse.readFileSync(path, "utf-8")) as DirsyncConfigFile)
				: undefined
		);
}

export function writeConfingFiles(
	trees: FileTree[],
	excludeGlobs: Record<UUID, Set<string>>,
	skipGlobs: Record<UUID, Set<string>>
) {
	trees.forEach(tree => {
		const config: DirsyncConfigFile = {
			dirsyncVersion: version,
			lastSyncDate: new Date().toISOString(),
			thisDirUuid: tree.rootUuid,
			excludeFromSync: Array.from(excludeGlobs[tree.rootUuid]),
			skipSync: Array.from(skipGlobs[tree.rootUuid]),
		};
		fse.writeFileSync(path.join(tree.absolutePath, configFileName), JSON.stringify(config));
	});
}
