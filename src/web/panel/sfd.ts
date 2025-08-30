import * as vscode from "vscode";

export async function getGlyphFileDataAsync(
    gid: number,
    folder: vscode.Uri,
): Promise<string[] | null> {
    const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "*.glyph"),
    );
    for (const file of files) {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            const glyphData = doc.getText().split("\n");
            for (const line of glyphData) {
                if (!line.startsWith("Encoding:")) { continue; }

                const parts = line.split(" ");
                if (parts.length < 4) { break; }

                const candidateGid = parseInt(parts[3], 10);
                if (candidateGid !== gid) { break; }

                return glyphData;
            }
        } catch (e) {
            return null;
        }
    }
    return null;
}
