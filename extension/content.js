/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var stm_vad;

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
                console.log('here 0');

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

                // VAD initializations
                // console.log("Sample rate: ", audioContext.sampleRate);
                let bufferSize = 2048;
                //create a javascript node
                let scriptprocessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                // specify the processing function
                console.log('here 1', stm_vad.reset);
                stm_vad.reset();
                console.log('here 2');
                scriptprocessor.onaudioprocess = stm_vad.recorderProcess;

                stm_vad.stopGum = () => {
                    console.log('stopGum');
                    mediaRecorder.stop();
                    sourceNode.disconnect(scriptprocessor);
                    sourceNode.disconnect(analyzerNode);
                    analyzerNode.disconnect(outputNode);
                }
                // connect stream to our recorder
                sourceNode.connect(scriptprocessor);

                // MediaRecorder initialization
                let mediaRecorder = new MediaRecorder(outputNode.stream, options);
                console.log('speaktomeshowat');
                SpeakToMePopup.showAt(event.clientX, event.clientY);

                SpeakToMePopup.wait_for_stop().then(() => {
                    mediaRecorder.stop();
                });

                document.getElementById("stm-levels").hidden = false;
                visualize(analyzerNode);
                console.log('here 3');

                mediaRecorder.start();

                mediaRecorder.onstop = (e) => {
                    document.getElementById("stm-levels").hidden = true;
                    console.log('mediaRecorder onStop');
                    // We stopped the recording, send the content to the STT server.
                    mediaRecorder = null;
                    audioContext = null;
                    sourceNode = null;
                    analyzerNode = null;
                    outputNode = null;
                    stream = null;
                    scriptprocessor = null;

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
                    console.log('mediaRecorder.ondataavailable');
                }

                console.log('end of on_spm_icon');
                console.log('here 4');

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
    stm_vad = function SpeakToMeVad(){

        this.webrtc_main = Module.cwrap('main');
        this.webrtc_main();
        this.webrtc_setmode = Module.cwrap('setmode', 'number', ['number']);
        this.webrtc_setmode(3);
        this.webrtc_process_data = Module.cwrap('process_data', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
        this.sizeBufferVad = 480;
        this.minvoice = 250;
        this.maxsilence = 1500;
        this.maxtime = 6;


        this.reset = function(){
            console.log('here reset 1', stm_vad);
            this.buffer_vad = new Int16Array(this.sizeBufferVad);
            this.leftovers = 0;
            this.finishedvoice = false;
            this.samplesvoice = 0 ;
            this.samplessilence = 0 ;
            this.touchedvoice = false;
            console.log('here reset 2', stm_vad);
            this.touchedsilence = false;
            this.dtantes = Date.now();
            this.dtantesmili = Date.now();
            this.raisenovoice = false;
            this.done = false;
        }

        this.isSilence = function(buffer_pcm){
            // Get data byte size, allocate memory on Emscripten heap, and get pointer
            let nDataBytes = buffer_pcm.length * buffer_pcm.BYTES_PER_ELEMENT;
            let dataPtr = Module._malloc(nDataBytes);

            // Copy data to Emscripten heap (directly accessed from Module.HEAPU8)
            let dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, nDataBytes);
            dataHeap.set(new Uint8Array(buffer_pcm.buffer));

            // Call function and get result
            let result = this.webrtc_process_data(dataHeap.byteOffset, buffer_pcm.length, 48000, buffer_pcm[0], buffer_pcm[100], buffer_pcm[2000]);

            // Free memory
            Module._free(dataHeap.byteOffset);
            return result;
        }

        this.floatTo16BitPCM = function(output, input){
            for (let i = 0; i < input.length; i++) {
                let s = Math.max(-1, Math.min(1, input[i]));
                output[i] =  s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
        }

        this.recorderProcess = function(e){
            let buffer_pcm = new Int16Array(e.inputBuffer.getChannelData(0).length);
            stm_vad.floatTo16BitPCM(buffer_pcm, e.inputBuffer.getChannelData(0));
            console.log('aqui?', buffer_pcm.length, stm_vad.done);

            for (let i = 0; i < Math.ceil(buffer_pcm.length/stm_vad.sizeBufferVad) && !stm_vad.done; i++) {
                //console.log('entrou?');
                let start = i * stm_vad.sizeBufferVad;
                let end = start+stm_vad.sizeBufferVad;
                if ((start + stm_vad.sizeBufferVad) > buffer_pcm.length) {
                    // armazena para o proximo
                    stm_vad.buffer_vad.set(buffer_pcm.slice(start));
                    stm_vad.leftovers =  buffer_pcm.length - start;
                } else {
                    if (stm_vad.leftovers > 0) {
                        // we have this.leftovers from previous array
                        end = end - this.leftovers;
                        stm_vad.buffer_vad.set((buffer_pcm.slice(start, end)), stm_vad.leftovers);
                        stm_vad.leftovers =  0;
                    } else {
                        // envia para o vad
                        stm_vad.buffer_vad.set(buffer_pcm.slice(start, end));
                    }

                    // whole vad algorithm comes here
                    let vad = stm_vad.isSilence(stm_vad.buffer_vad);
                    //console.log('vad', vad);
                    stm_vad.buffer_vad = new Int16Array(stm_vad.sizeBufferVad);
                    let dtdepois = Date.now();
                    if (vad == 0) {
                        if (stm_vad.touchedvoice) {
                            stm_vad.samplessilence += dtdepois - stm_vad.dtantesmili;
                            if (stm_vad.samplessilence >  stm_vad.maxsilence) stm_vad.touchedsilence = true;
                        }
                    }
                    else {
                        stm_vad.samplesvoice  += dtdepois - stm_vad.dtantesmili;
                        if (stm_vad.samplesvoice >  stm_vad.minvoice) stm_vad.touchedvoice = true;
                    }
                    stm_vad.dtantesmili = dtdepois;

                    if (stm_vad.touchedvoice && stm_vad.touchedsilence){
                        stm_vad.finishedvoice = true;
                    }

                    if (stm_vad.finishedvoice){
                        stm_vad.done = true;
                        stm_vad.goCloud('GoCloud finishedvoice');
                    }

                    if ((dtdepois - stm_vad.dtantes)/1000 > stm_vad.maxtime ) {
                        stm_vad.done = true;
                        if (stm_vad.touchedvoice) {
                            stm_vad.goCloud('GoCloud timeout');
                        } else {
                            stm_vad.goCloud('Raise novoice');
                            stm_vad.raisenovoice = true;
                        }
                    }

                }
            }
        }

        this.goCloud = function(why) {
            console.log(why);
            this.stopGum();
        }

        console.log('speakToMeVad created()');

    }

    console.log('finished loading main content', speakToMeVad);

})();

