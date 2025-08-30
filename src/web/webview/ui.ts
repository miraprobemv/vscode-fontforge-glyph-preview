export function initializeUI(sideMenu: HTMLElement, openButton: HTMLElement) {
    openButton.addEventListener("click", () => {
        toggleSideMenu(sideMenu);
    });
}

function toggleSideMenu(sideMenu: HTMLElement) {
    sideMenu.classList.toggle("_closed");
}
function closeSideMenu(sideMenu: HTMLElement) {
    sideMenu.classList.add("_closed");
}

export function updateGlyphList(
    sideMenu: HTMLElement,
    openButton: HTMLButtonElement,
    listContainer: HTMLElement,
    nameToGidList: [string, number][],
    onItemClick: (name: string, gid: number) => void,
) {
    for (const child of Array.from(listContainer.children)) {
        listContainer.removeChild(child); // Clear previous content
    }

    const ul = document.createElement("ul");
    for (const [name, gid] of nameToGidList) {
        const li = document.createElement("li");
        li.textContent = name;
        li.addEventListener("click", () => {
            closeSideMenu(sideMenu);
            onItemClick(name, gid);
        });
        ul.appendChild(li);
    }
    listContainer.appendChild(ul);
    if (nameToGidList.length <= 1) {
        openButton.disabled = true;
        sideMenu.classList.add("_closed");
    } else {
        openButton.disabled = false;
    }
}

export function showGlyphName(span: HTMLElement, name: string) {
    span.textContent = name;
}

export function setupResizeFinishedEvent() {
    let resizeTimeout: NodeJS.Timeout;
    window.addEventListener("resize", () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
            window.dispatchEvent(new CustomEvent("resizeFinished"));
        }, 300);
    });
}
