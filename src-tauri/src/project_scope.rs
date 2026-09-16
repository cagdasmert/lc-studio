use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

/// Resolve the project directory whose contents the frontend may read.
///
/// Accepts a `.lcs` directory (existing, or about to be created by Save As) or
/// a `project.json` inside one. Anything else is refused, so this command can't
/// be used to widen file access to arbitrary folders.
pub fn project_dir_for(path: &Path) -> Result<PathBuf, String> {
    let refuse = || format!("not an lc-studio project folder: {}", path.display());

    let dir = if path.file_name().is_some_and(|n| n == "project.json") {
        path.parent().ok_or_else(refuse)?.to_path_buf()
    } else {
        path.to_path_buf()
    };

    let is_lcs = dir.extension().is_some_and(|e| e == "lcs");

    if dir.is_dir() {
        if is_lcs || dir.join("project.json").is_file() {
            return dir.canonicalize().map_err(|e| format!("{}: {e}", dir.display()));
        }
        return Err(refuse());
    }

    // Save As hands us a `.lcs` path before the folder exists. Canonicalize the
    // parent instead, so symlinked locations still match the scope check later.
    if is_lcs && !dir.exists() {
        let parent = dir.parent().filter(|p| p.is_dir()).ok_or_else(refuse)?;
        let name = dir.file_name().ok_or_else(refuse)?;
        let parent = parent.canonicalize().map_err(|e| format!("{}: {e}", parent.display()))?;
        return Ok(parent.join(name));
    }

    Err(refuse())
}

/// Grant recursive read/write scope over a project directory.
///
/// The dialog plugin only scopes what the user picked: the `project.json` file,
/// or the project folder non-recursively. Bundled media live in `assets/` and
/// fonts in `assets/fonts/`, so without this every asset read is denied and
/// images and fonts silently fail to load after a project is reopened.
#[tauri::command]
pub fn allow_project_dir<R: Runtime>(app: AppHandle<R>, path: String) -> Result<String, String> {
    let dir = project_dir_for(Path::new(&path))?;
    app.fs_scope()
        .allow_directory(&dir, true)
        .map_err(|e| format!("could not allow project directory: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lcs-scope-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_an_lcs_directory() {
        let root = scratch("dir");
        let project = root.join("Launch.lcs");
        fs::create_dir_all(project.join("assets")).unwrap();
        assert_eq!(project_dir_for(&project).unwrap(), project.canonicalize().unwrap());
    }

    #[test]
    fn maps_project_json_to_its_directory() {
        let root = scratch("json");
        let project = root.join("Launch.lcs");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("project.json"), "{}").unwrap();
        assert_eq!(
            project_dir_for(&project.join("project.json")).unwrap(),
            project.canonicalize().unwrap()
        );
    }

    #[test]
    fn accepts_a_directory_holding_project_json_without_the_suffix() {
        let root = scratch("renamed");
        let project = root.join("Launch copy");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("project.json"), "{}").unwrap();
        assert_eq!(project_dir_for(&project).unwrap(), project.canonicalize().unwrap());
    }

    #[test]
    fn accepts_a_not_yet_created_lcs_directory_for_save_as() {
        let root = scratch("new");
        let project = root.join("Fresh.lcs");
        assert_eq!(
            project_dir_for(&project).unwrap(),
            root.canonicalize().unwrap().join("Fresh.lcs")
        );
    }

    #[test]
    fn refuses_arbitrary_directories_and_files() {
        let root = scratch("refuse");
        fs::write(root.join("notes.json"), "{}").unwrap();
        assert!(project_dir_for(&root).is_err());
        assert!(project_dir_for(&root.join("notes.json")).is_err());
        assert!(project_dir_for(Path::new("/")).is_err());
    }

    #[test]
    fn granting_a_project_makes_its_nested_assets_readable() {
        let root = scratch("grant");
        let project = root.join("Launch.lcs");
        fs::create_dir_all(project.join("assets/fonts")).unwrap();
        fs::write(project.join("project.json"), "{}").unwrap();
        fs::write(project.join("assets/can.png"), b"png").unwrap();
        fs::write(project.join("assets/fonts/Brand-Black.ttf"), b"ttf").unwrap();

        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let scope = app.fs_scope();
        let image = project.join("assets/can.png");
        let font = project.join("assets/fonts/Brand-Black.ttf");

        // What the open dialog grants today: the folder, non-recursively.
        scope.allow_directory(&project, false).unwrap();
        assert!(scope.is_allowed(project.join("project.json")));
        assert!(!scope.is_allowed(&image), "bug reproduced: assets/ not readable");
        assert!(!scope.is_allowed(&font));

        let granted = allow_project_dir(
            app.handle().clone(),
            project.join("project.json").to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(PathBuf::from(granted), project.canonicalize().unwrap());
        assert!(scope.is_allowed(&image));
        assert!(scope.is_allowed(&font));
        // The grant stays inside the project.
        fs::write(root.join("outside.txt"), "x").unwrap();
        assert!(!scope.is_allowed(root.join("outside.txt")));
    }

    #[test]
    fn refuses_a_legacy_flat_lcs_json_file() {
        let root = scratch("legacy");
        fs::write(root.join("Old.lcs.json"), "{}").unwrap();
        assert!(project_dir_for(&root.join("Old.lcs.json")).is_err());
    }
}
