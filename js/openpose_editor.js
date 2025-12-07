import { app } from "/scripts/app.js";
import { ComfyDialog, $el } from "/scripts/ui.js";
import { ComfyApp } from "/scripts/app.js";


function addMenuHandler(nodeType, cb) {
    const getOpts = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function () {
        const r = getOpts.apply(this, arguments);
        cb.apply(this, arguments);
        return r;
    };
}

// Helper function to find widget by name
function findWidgetByName(node, name) {
    if (!node.widgets) return null;
    return node.widgets.find(w => w.name === name);
}

// Helper function to find resolution_x widget
function findResolutionXWidget(node) {
    return findWidgetByName(node, "resolution_x");
}

class OpenposeEditorDialog extends ComfyDialog {
    static timeout = 5000;
    static instance = null;

    static getInstance() {
        if (!OpenposeEditorDialog.instance) {
            OpenposeEditorDialog.instance = new OpenposeEditorDialog();
        }

        return OpenposeEditorDialog.instance;
    }

    constructor() {
        super();
        // Create modal element without using comfy-modal class
        this.element = $el("div", {
            id: "openpose-editor-modal",
            parent: document.body,
            style: {
                display: "none",
                position: "fixed",
                top: "0",
                left: "0",
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(0, 0, 0, 0.9)",
                zIndex: "99999",
            },
        });

        const contentBox = $el("div", {
            id: "openpose-editor-content",
            style: {
                position: "absolute",
                top: "20px",
                left: "20px",
                right: "20px",
                bottom: "20px",
                backgroundColor: "#1e1e1e",
                borderRadius: "8px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            },
        });

        this.element.appendChild(contentBox);
        this.contentBox = contentBox;
        this.is_layout_created = false;

        window.addEventListener("message", (event) => {
            if (event.source !== this.iframeElement.contentWindow) {
                return;
            }

            const message = event.data;
            if (message.modalId === 0) {
                const targetNode = ComfyApp.clipspace_return_node;
                const poseJsonWidget = findWidgetByName(targetNode, "POSE_JSON");
                if (poseJsonWidget && poseJsonWidget.element) {
                    poseJsonWidget.element.value = JSON.stringify(event.data.poses);
                }
                ComfyApp.onClipspaceEditorClosed();
                this.close();
            }
        });
    }

    createButtons() {
        const closeBtn = $el("button", {
            type: "button",
            textContent: "Close",
            onclick: () => this.close(),
        });
        return [
            closeBtn,
        ];
    }

    close() {
        this.element.style.display = "none";
    }

    async show() {
        if (!this.is_layout_created) {
            this.createLayout();
            this.is_layout_created = true;
            await this.waitIframeReady();
        }

        const targetNode = ComfyApp.clipspace_return_node;
        const poseJsonWidget = findWidgetByName(targetNode, "POSE_JSON");
        const resolutionXWidget = findResolutionXWidget(targetNode);

        this.element.style.display = "block";

        // Get the current POSE_JSON value
        let poseJsonValue = "";
        if (poseJsonWidget && poseJsonWidget.element) {
            poseJsonValue = poseJsonWidget.element.value || "";
        } else if (poseJsonWidget) {
            poseJsonValue = poseJsonWidget.value || "";
        }

        if (poseJsonValue === "") {
            // Create default pose with resolution
            let resolution_x = resolutionXWidget ? resolutionXWidget.value : 512;
            let resolution_y = Math.floor(768 * (resolution_x * 1.0 / 512));
            if (resolution_x < 64) {
                resolution_x = 512;
                resolution_y = 768;
            }

            // Default standing pose with 18 COCO keypoints (x, y, confidence)
            // Keypoints: nose, neck, r_shoulder, r_elbow, r_wrist, l_shoulder, l_elbow, l_wrist,
            //           r_hip, r_knee, r_ankle, l_hip, l_knee, l_ankle, r_eye, l_eye, r_ear, l_ear
            // Scaled to fit nicely in canvas (roughly 50% size, centered)
            const cx = resolution_x / 2;
            const cy = resolution_y / 2;
            const scale = 0.4; // 40% of canvas size for compact display
            const bodyHeight = resolution_y * scale;
            const shoulderWidth = 25;
            const armLength = 20;
            const hipWidth = 15;
            const legSpread = 20;

            const defaultKeypoints = [
                cx, cy - bodyHeight * 0.45, 1,                    // 0: nose
                cx, cy - bodyHeight * 0.38, 1,                    // 1: neck
                cx - shoulderWidth, cy - bodyHeight * 0.35, 1,    // 2: right shoulder
                cx - shoulderWidth - armLength, cy - bodyHeight * 0.20, 1,  // 3: right elbow
                cx - shoulderWidth - armLength * 1.5, cy - bodyHeight * 0.05, 1, // 4: right wrist
                cx + shoulderWidth, cy - bodyHeight * 0.35, 1,    // 5: left shoulder
                cx + shoulderWidth + armLength, cy - bodyHeight * 0.20, 1,  // 6: left elbow
                cx + shoulderWidth + armLength * 1.5, cy - bodyHeight * 0.05, 1, // 7: left wrist
                cx - hipWidth, cy + bodyHeight * 0.05, 1,         // 8: right hip
                cx - legSpread, cy + bodyHeight * 0.25, 1,        // 9: right knee
                cx - legSpread, cy + bodyHeight * 0.45, 1,        // 10: right ankle
                cx + hipWidth, cy + bodyHeight * 0.05, 1,         // 11: left hip
                cx + legSpread, cy + bodyHeight * 0.25, 1,        // 12: left knee
                cx + legSpread, cy + bodyHeight * 0.45, 1,        // 13: left ankle
                cx - 8, cy - bodyHeight * 0.47, 1,                // 14: right eye
                cx + 8, cy - bodyHeight * 0.47, 1,                // 15: left eye
                cx - 15, cy - bodyHeight * 0.45, 1,               // 16: right ear
                cx + 15, cy - bodyHeight * 0.45, 1                // 17: left ear
            ];

            let pose = JSON.stringify([{
                "people": [{
                    "pose_keypoints_2d": defaultKeypoints,
                    "face_keypoints_2d": [],
                    "hand_left_keypoints_2d": [],
                    "hand_right_keypoints_2d": []
                }],
                "canvas_height": resolution_y,
                "canvas_width": resolution_x
            }]);
            this.setCanvasJSONString(pose);
        } else {
            this.setCanvasJSONString(poseJsonValue.replace(/'/g, '"'));
        }
    }

    createLayout() {
        // Create header bar with title and close button
        const headerBar = $el("div.openpose-header", {
            style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 20px",
                backgroundColor: "#2a2a2a",
                borderBottom: "1px solid #444",
            },
        }, [
            $el("div.openpose-title", {
                style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                },
            }, [
                $el("span", {
                    textContent: "🦴",
                    style: { fontSize: "20px" },
                }),
                $el("span", {
                    textContent: "Openpose Editor",
                    style: {
                        color: "#fff",
                        fontSize: "16px",
                        fontWeight: "600",
                    },
                }),
            ]),
            $el("button", {
                type: "button",
                textContent: "✕ Close",
                style: {
                    padding: "8px 20px",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "background-color 0.2s",
                },
                onclick: () => this.close(),
                onmouseenter: (e) => e.target.style.backgroundColor = "#c82333",
                onmouseleave: (e) => e.target.style.backgroundColor = "#dc3545",
            }),
        ]);

        // Create iframe container
        const iframeContainer = $el("div.openpose-iframe-container", {
            style: {
                flex: "1",
                width: "100%",
                height: "calc(100% - 52px)",
                overflow: "hidden",
            },
        });

        this.iframeElement = $el("iframe", {
            src: "extensions/ComfyUI-ultimate-openpose-editor/ui/OpenposeEditor.html",
            style: {
                width: "100%",
                height: "100%",
                border: "none",
                backgroundColor: "#1a1a1a",
            },
        });

        iframeContainer.appendChild(this.iframeElement);

        // Clear and populate content box
        while (this.contentBox.firstChild) {
            this.contentBox.removeChild(this.contentBox.firstChild);
        }
        this.contentBox.appendChild(headerBar);
        this.contentBox.appendChild(iframeContainer);
    }

    waitIframeReady() {
        return new Promise((resolve, reject) => {
            const receiveMessage =  (event) => {
                if (event.source !== this.iframeElement.contentWindow) {
                    return;
                }
                if (event.data.ready) {
                    window.removeEventListener("message", receiveMessage);
                    clearTimeout(timeoutHandle);
                    resolve();
                }
            };
            const timeoutHandle = setTimeout(() => {
                reject(new Error("Timeout"));
            }, OpenposeEditorDialog.timeout);

            window.addEventListener("message", receiveMessage);
        });
    }

    setCanvasJSONString(jsonString) {
        this.iframeElement.contentWindow.postMessage({
            modalId: 0,
            poses: JSON.parse(jsonString)
        }, "*");
    }
}

app.registerExtension({
    name: "OpenposeEditor",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "OpenposeEditorNode") {
            addMenuHandler(nodeType, function (_, options) {
                options.unshift({
                    content: "Open in Openpose Editor",
                    callback: () => {
                        // `this` is the node instance
                        ComfyApp.copyToClipspace(this);
                        ComfyApp.clipspace_return_node = this;

                        const dlg = OpenposeEditorDialog.getInstance();
                        dlg.show();
                    },
                });
            });
        }
    }
});
