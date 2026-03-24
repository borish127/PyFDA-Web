# PyFDA Web

A static, client-side web application for Digital Signal Processing (DSP) filter design and analysis. This tool brings the core logic of the Python `pyfda` application to the browser using WebAssembly and Pyodide, eliminating the need for a backend server.

## Features

* **Filter Design:** Design Lowpass, Highpass, Bandpass, Bandstop, and Allpass filters.
* **Filter Families:** Support for IIR (Butterworth, Chebyshev, Elliptic, Bessel) and FIR (Windowed, Equiripple, Moving Average, Least-Squares) methods.
* **Interactive Analysis:** Visualize Frequency Response (Magnitude/Phase), Group/Phase Delay, Pole-Zero plots, Time-domain responses (Impulse, Step, Stimulus), and 3D Magnitude surfaces.
* **Fixpoint Simulation:** Simulate quantization effects with configurable word lengths and overflow/rounding behaviors.
* **File I/O:** Import and export filter designs locally in `.npz`, `.csv`, `.mat`, and `.json` formats.
* **Responsive Design:** Optimized for both desktop and mobile web browsers.

## Usage

PyFDA Web is a completely static application. All computations run locally in your browser.

**Option 1: Local Execution**
1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/borish127/PyFDA-Web.git
   
2. Open the index.html file directly in any modern web browser.

**Option 2: Web Hosting**
Upload the repository files to any static hosting service (e.g., GitHub Pages, Vercel, Netlify) to make the tool accessible online.


## Technology Stack

- Core Interface: HTML5, CSS3, JavaScript.

- Design System: Material Design 3 (MD3).

- Data Visualization: Plotly.js.

- DSP Runtime: Python (scipy.signal, numpy) executed via Pyodide.

# Contributing

We welcome contributions to PyFDA Web. Whether you want to fix bugs, optimize the interface, add new DSP features, or suggest improvements, your help is appreciated.

How to contribute:

1. Fork the project.

2. Create your feature branch (git checkout -b feature/NewFeature).

3. Commit your changes (git commit -m 'Add some NewFeature').

4. Push to the branch (git push origin feature/NewFeature).

5. Open a Pull Request.

For major changes or feature proposals, please open an issue first to discuss what you would like to change.

## License
This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details. PyFDA Web is a web-based adaptation of the original pyfda project.
