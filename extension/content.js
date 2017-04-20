/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function speak_to_me() {

console.log("Speak To Me starting up...");

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error("You need a browser with getUserMedia support to use Speak To Me, sorry!");
    return;
}

const LOCAL_TEST = false;

const stt_server_url = "http://54.183.226.82:9001/asr";

function visualize(analyzerNode) {
    const MIN_DB_LEVEL = -85;      // The dB level that is 0 in the levels display
    const MAX_DB_LEVEL = -30;      // The dB level that is 100% in the levels display

    // Set up the analyzer node, and allocate an array for its data
    // FFT size 64 gives us 32 bins. But those bins hold frequencies up to
    // 22kHz or more, and we only care about visualizing lower frequencies
    // which is where most human voice lies, so we use fewer bins
    analyzerNode.fftSize = 64;
    let frequencyBins = new Float32Array(14);

    // Clear the canvas
    let levels = document.getElementById("stm-levels");
    let context = levels.getContext("2d");
    context.clearRect(0, 0, levels.width, levels.height);

    if (levels.hidden) {
        // If we've been hidden, return right away without calling rAF again.
        return;
    }

    // Get the FFT data
    analyzerNode.getFloatFrequencyData(frequencyBins);

    // Display it as a barchart.
    // Drop bottom few bins, since they are often misleadingly high
    let skip = 2;
    let n = frequencyBins.length - skip;
    let barwidth = levels.width / n;
    let dbRange = MAX_DB_LEVEL - MIN_DB_LEVEL;

    // Loop through the values and draw the bars
    context.fillStyle = "black";
    for (let i = 0; i < n; i++) {
        let value = frequencyBins[i + skip];
        let height = levels.height * (value - MIN_DB_LEVEL) / dbRange;
        if (height < 0) {
            continue;
        }
        // Display a bar for this value.
        context.fillRect(i * barwidth, (levels.height - height) / 2, barwidth / 2, height);
    }

    // Update the visualization the next time we can
    requestAnimationFrame(function() { visualize(analyzerNode); });
}

// Encapsulation of the popup we use to provide our UI.
const popup_markup =
`
<div id="stm-popup">
  <span id="stm-stop">Speak To Me…</span>
  <div id="stm-divlevels"> <canvas hidden id="stm-levels" width=150 height=50></canvas></div>
  <div id="stm-list"></div>
</div>
`;

const SpeakToMePopup = {
    init: () => {
        console.log(`SpeakToMePopup init`);
        let popup = document.createElement("div");
        popup.innerHTML = popup_markup;
        document.body.appendChild(popup);
        this.popup = document.getElementById("stm-popup");
        this.list = document.getElementById("stm-list");
    },

    showAt: (x, y) => {
        console.log(`SpeakToMePopup showAt ${x},${y}`);
        this.list.classList.add("hidden");
        let style = this.popup.style;
        style.display = "block";
        let bcr = this.popup.getBoundingClientRect();
        style.left = (x + window.scrollX - bcr.width / 2) + "px";
        style.top = (y + window.scrollY - bcr.width / 2) + "px";
    },

    hide: () => {
        console.log(`SpeakToMePopup hide`);
        this.popup.style.display = "none";
    },

    // Returns a Promise that resolves once the "Stop" button is clicked.
    // TODO: replace with silence detection.
    wait_for_stop: () => {
        console.log(`SpeakToMePopup wait_for_stop`);
        return new Promise((resolve, reject) => {
            console.log(`SpeakToMePopup set popup stop listener`);
            let button = document.getElementById("stm-stop");
            let popup = document.getElementById("stm-popup");
            button.classList.remove("hidden");
            popup.addEventListener("click", function _mic_stop() {
                button.classList.add("hidden");
                popup.removeEventListener("click", _mic_stop);
                resolve();
            });
        });
    },

    // Returns a Promise that resolves to the choosen text.
    choose_item: (data) => {
        console.log(`SpeakToMePopup choose_item`);
        return new Promise((resolve, reject) => {
            let html = "<ul class='stm-list'>";
            data.forEach(item => {
                html += `<li>${item.text}</li>`;
            });
            html += "</ul>";
            let list = this.list;
            list.innerHTML = html;
            list.classList.remove("hidden");

            list.addEventListener("click", function _choose_item(e) {
                list.removeEventListener("click", _choose_item);
                if (e.target instanceof HTMLLIElement) {
                    resolve(e.target.textContent);
                }
            });
        });
    }
}

// The icon that we anchor to the currently focused input element.

// TODO: figure out why using a resource in the extensions with browser.extension.getURL() fails.
const mic_icon_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAQAAABLCVATAAABW0lEQVR4Ad2VJXQDMRyHU1Ljzeu6+tnKeTM7NmPUu9CYSQ38ewVXWd/5t7qaoRrz/kkuNyoz/b5cOF+vjMoS7tqY2ohuPG9EZevIW7Ph2AhuwA/BvFXrQ+vwj6F8RZE4USRf0VOc6DlP0RrEUzeiVYij4qIViKPiomWII1/REsRTadEixFNp0QLEk8vhO3WAu8z+RZzoQs2yRrP/mkHEzzhwYG6zf8LhH0dqlnrMHbFMIr+5bUT1mZs//NE8aD0bN0f+DCLWy0AS4y5z5GU35hhk69V/ByxmjnsziRrZDQXJoh7TZtpN5+TVbI0X1arUNqJMYSMUFGw8ydq4tTaCMofYSYiASUC/KpbETQLWfIjYUTahzSRMwOKUHBiUHMgWLMK0OYd/WLyDIQkfeIe7UG7BnSSAP/5KSIB6UH7B7bhLa2TbgQqLAYq4yYqK8IchX59i3BGdfzAoqsEI9//IsA+uNg0AAAAASUVORK5CYII=";
const mic_icon_width = 36;
const mic_icon_height = 36;

class SpeakToMeIcon {
    constructor() {
        console.log(`SpeakToMeIcon constructor ${this}`);
        this.icon = document.createElement("div");
        let mic = document.createElement("img");
        mic.src = mic_icon_url;
        this.icon.appendChild(mic);
        this.icon.classList.add("stm-icon");
        this.icon.classList.add("hidden");
        document.body.appendChild(this.icon);

        this.icon.addEventListener("click", on_spm_icon_click);

        let self = this;
        document.body.addEventListener("focusin", (event) => {
            self.anchor_to(event.target);
        });

        // Check if an element is already focused in the document.
        if (document.hasFocus() && document.activeElement) {
            self.anchor_to(document.activeElement);
        }
    }

    // Checks if the input field moved around and if we need to
    // reposition the icon.
    update_pos() {
        //console.log(`SpeakToMeIcon update_pos`);
        let bcr = this._input_field.getBoundingClientRect();
        // Position the mic at the end of the input field.
        let left = (bcr.width + bcr.left + window.scrollX - mic_icon_width) + "px";
        if (left != this.icon.style.left) {
            this.icon.style.left = left;
        }
        let top = (bcr.top + window.scrollY + (bcr.height - mic_icon_height) / 2) + "px";
        if (top != this.icon.style.top) {
            this.icon.style.top = top;
        }
        requestAnimationFrame(this.update_pos.bind(this));
    }

    anchor_to(target) {
        console.log(`SpeakToMeIcon anchor_to ${target}`);

        if (!(target instanceof HTMLInputElement &&
            ["text", "email", "search"].indexOf(target.type) >= 0)) {
            return;
        }

         if (this._input_field) {
            this._input_field.classList.remove("stm-focused");
        }

        this.icon.classList.remove("hidden");
        this._input_field = target;
        this._input_field.classList.add("stm-focused");

        requestAnimationFrame(this.update_pos.bind(this));
    }

    set_input(text) {
        console.log(`SpeakToMeIcon set_input ${text}`);
        this._input_field.value = text;
        this._input_field.focus();
    }
}


const on_spm_icon_click = (event) => {
    let constraints = { audio: true };
    let chunks = [];

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        // Build the WebAudio graph we'll be using
        let audioContext = new AudioContext();
        let sourceNode = audioContext.createMediaStreamSource(stream);
        let analyzerNode = audioContext.createAnalyser();
        let outputNode = audioContext.createMediaStreamDestination();
        // make sure we're doing mono everywhere
        sourceNode.channelCount = 1;
        analyzerNode.channelCount = 1;
        outputNode.channelCount = 1;
        // connect the nodes together
        sourceNode.connect(analyzerNode);
        analyzerNode.connect(outputNode);
        // and set up the recorder
        let options = {
            audioBitsPerSecond : 16000,
            mimeType : "audio/ogg"
        }

        let harkoptions = {};
        let speechEvents = HarkLoader.init(outputNode.stream, harkoptions);
        console.log('speechEvents', speechEvents);
        speechEvents.on('speaking', function() {
            console.log('speaking');
        });

        speechEvents.on('stopped_speaking', function() {
            console.log('stopped_speaking');
            mediaRecorder.stop();
        });

        let mediaRecorder = new MediaRecorder(outputNode.stream, options);

        SpeakToMePopup.showAt(event.clientX, event.clientY);

        SpeakToMePopup.wait_for_stop().then(() => {
            mediaRecorder.stop();
        });

        document.getElementById("stm-levels").hidden = false;
        visualize(analyzerNode);

        mediaRecorder.start();

        mediaRecorder.onstop = (e) => {
            document.getElementById("stm-levels").hidden = true;

            // We stopped the recording, send the content to the STT server.
            mediaRecorder = null;
            audioContext = null;
            sourceNode = null;
            analyzerNode = null;
            outputNode = null;
            stream = null;

            let blob = new Blob(chunks, { "type" : "audio/ogg; codecs=opus" });
            chunks = [];

            if (LOCAL_TEST) {
                let json = JSON.parse('{"status":"ok","data":[{"confidence":0.807493,"text":"PLEASE ADD MILK TO MY SHOPPING LIST"},{"confidence":0.906263,"text":"PLEASE AT MILK TO MY SHOPPING LIST"},{"confidence":0.904414,"text":"PLEASE ET MILK TO MY SHOPPING LIST"}]}');
                if (json.status == "ok") {
                    display_options(json.data);
                }
                return;
            }

            fetch(stt_server_url, {
                method: "POST",
                body: blob
                })
            .then((response) => { return response.json(); })
            .then((json) => {
                console.log(`Got STT result: ${JSON.stringify(json)}`);
                if (json.status == "ok") {
                    display_options(json.data);
                }
            })
            .catch((error) => {
                console.error(`Fetch error: ${error}`);
            });
        }

        mediaRecorder.ondataavailable = (e) => {
            chunks.push(e.data);
        }
    })
    .catch(function(err) {
        console.log(`Recording error: ${err}`);
    });
}

const display_options = (items) => {
    // Filter the array for empty items and normalize the text.
    let data = items.filter((item) => { return item.text != ""; })
                    .map((item) => { return { confidence: item.confidence,
                                              text: item.text.toLowerCase() 
                                             } });

    if (data.length == 0) {
        // TODO: display some failure notification to the user?
        SpeakToMePopup.hide();
        return;
    }

    // if the first result has a high enough confidence, just
    // use it directly.
    if (data[0].confidence > 0.90) {
        stm_icon.set_input(data[0].text);
        SpeakToMePopup.hide();
        return;
    }

    SpeakToMePopup.choose_item(data).then((text) => {
        stm_icon.set_input(text);
        // Once a choice is made, close the popup.
        SpeakToMePopup.hide();
    });
}

SpeakToMePopup.init();

let stm_icon = new SpeakToMeIcon();

// VAD
function setupwebrtc(){
    console.log('setupwebrtc');
    var main = Module.cwrap('main');
    main();
    var setmode = Module.cwrap('setmode', 'number', ['number']);
    console.log(setmode(3));
    var process_data = Module.cwrap('process_data', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);

    const sizeBufferVad = 480;
    let leftovers = 0;
    let buffer_vad = new Int16Array(sizeBufferVad);

    const minvoice = 250;
    const maxsilence = 1500;
    const maxtime = 6;
    let silenceblocks = 0;
    let skipsamples = 0;
    let finishedvoice = false;
    let samplesvoice = 0 ;
    let samplessilence = 0 ;
    let touchedvoice = false;
    let touchedsilence = false;
    let dtantes = Date.now();
    let dtantesmili = Date.now();
    let raisenovoice = false;
    let done = false;
    let context;
    function recorderProcess(e) {
        let buffer_pcm = new Int16Array(e.inputBuffer.getChannelData(0).length);
        floatTo16BitPCM(buffer_pcm, e.inputBuffer.getChannelData(0));

        for (let i = 0; i < Math.ceil(buffer_pcm.length/sizeBufferVad) && !done; i++) {
            let start = i * sizeBufferVad;
            let end = start+sizeBufferVad;
            if ((start + sizeBufferVad) > buffer_pcm.length) {
                // armazena para o proximo
                buffer_vad.set(buffer_pcm.slice(start));
                leftovers =  buffer_pcm.length - start;
            } else {
                if (leftovers > 0) {
                    // we have leftovers from previous array
                    end = end - leftovers;
                    buffer_vad.set((buffer_pcm.slice(start, end)), leftovers);
                    leftovers =  0;
                } else {
                    // envia para o vad
                    buffer_vad.set(buffer_pcm.slice(start, end));
                }

                // whole vad algorithm comes here
                let vad = isSilence(buffer_vad);
                buffer_vad = new Int16Array(sizeBufferVad);
                let dtdepois = Date.now();
                if (vad == 0) {
                    if (touchedvoice) {
                        samplessilence += dtdepois - dtantesmili;
                        if (samplessilence >  maxsilence) touchedsilence = true;
                    }
                }
                else {
                    samplesvoice  += dtdepois - dtantesmili;
                    if (samplesvoice >  minvoice) touchedvoice = true;
                }
                dtantesmili = dtdepois;

                if (touchedvoice && touchedsilence)
                    finishedvoice = true;

                if (finishedvoice){
                    done = true;
                    goCloud('GoCloud finishedvoice');
                }

                if ((dtdepois - dtantes)/1000 > maxtime ) {
                    done = true;
                    if (touchedvoice) {
                        goCloud('GoCloud timeout');
                    } else {
                        goCloud('Raise novoice');
                        raisenovoice = true;
                    }
                }

            }
        }
    }

    function goCloud(type) {
        console.log(type)
        context.close();
    }


    function isSilence(buffer_pcm){
        // Get data byte size, allocate memory on Emscripten heap, and get pointer
        let nDataBytes = buffer_pcm.length * buffer_pcm.BYTES_PER_ELEMENT;
        let dataPtr = Module._malloc(nDataBytes);

        // Copy data to Emscripten heap (directly accessed from Module.HEAPU8)
        let dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, nDataBytes);
        dataHeap.set(new Uint8Array(buffer_pcm.buffer));

        // Call function and get result
        let result = process_data(dataHeap.byteOffset, buffer_pcm.length, 48000, buffer_pcm[0], buffer_pcm[100], buffer_pcm[2000]);

        // Free memory
        Module._free(dataHeap.byteOffset);
        return result;
    }

    let constraints = { audio: true };
    navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            let audioContext = window.AudioContext;
            context = new audioContext();
            console.log(context.sampleRate);
            var audioInput = context.createMediaStreamSource(stream);
            var bufferSize = 2048;
            // create a javascript node
            var recorder = context.createScriptProcessor(bufferSize, 1, 1);
            // specify the processing function
            recorder.onaudioprocess = recorderProcess;
            // connect stream to our recorder
            audioInput.connect(recorder);
            // connect our recorder to the previous destination
            recorder.connect(context.destination);
        })
        .catch(function(err) {
            console.log(`Recording error: ${err}`);
        });

    function floatTo16BitPCM(output, input) {
        for (let i = 0; i < input.length; i++) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output[i] =  s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
    }
}

})();
