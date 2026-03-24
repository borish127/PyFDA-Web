"""
PyFDA Web — Filter Design Dispatcher
All filter design methods using scipy.signal
"""
import numpy as np
from scipy import signal
import json


def design_filter(responseType='lowpass', filterFamily='iir', designMethod='butter',
                  fs=48000, fpb=1000, fsb=5000, fpb2=8000, fsb2=12000,
                  apb=1, asb=60, order=None, window='hamming',
                  freqUnit='hz', ampUnit='db', **kwargs):
    """
    Design a digital filter and return coefficients, poles, zeros, gain.
    """
    try:
        nyq = fs / 2.0

        # --- Normalize frequencies ---
        if freqUnit == 'hz':
            wp = fpb / nyq
            ws = fsb / nyq
            if responseType in ('bandpass', 'bandstop'):
                wp = [fpb / nyq, fpb2 / nyq]
                ws = [fsb / nyq, fsb2 / nyq]
        else:
            wp = fpb
            ws = fsb
            if responseType in ('bandpass', 'bandstop'):
                wp = [fpb, fpb2]
                ws = [fsb, fsb2]

        # Clamp to valid range
        if isinstance(wp, list):
            wp = [max(0.001, min(0.999, w)) for w in wp]
            ws = [max(0.001, min(0.999, w)) for w in ws]
        else:
            wp = max(0.001, min(0.999, wp))
            ws = max(0.001, min(0.999, ws))

        # Map response type to scipy btype
        btype_map = {
            'lowpass': 'lowpass', 'highpass': 'highpass',
            'bandpass': 'bandpass', 'bandstop': 'bandstop',
        }
        btype = btype_map.get(responseType, 'lowpass')

        b, a, sos_out, zpk_out = None, None, None, None
        actual_order = order

        # ===================== IIR METHODS =====================
        if designMethod in ('butter', 'cheby1', 'cheby2', 'ellip', 'bessel'):
            if order is None:
                # Auto order calculation
                if designMethod == 'butter':
                    actual_order, wn = signal.buttord(wp, ws, apb, asb)
                elif designMethod == 'cheby1':
                    actual_order, wn = signal.cheb1ord(wp, ws, apb, asb)
                elif designMethod == 'cheby2':
                    actual_order, wn = signal.cheb2ord(wp, ws, apb, asb)
                elif designMethod == 'ellip':
                    actual_order, wn = signal.ellipord(wp, ws, apb, asb)
                elif designMethod == 'bessel':
                    actual_order = 5  # Bessel has no auto-order in scipy
                    wn = wp
            else:
                actual_order = int(order)
                wn = wp

            # Design the filter
            if designMethod == 'butter':
                sos_out = signal.butter(actual_order, wn, btype=btype, output='sos')
                z, p, k = signal.butter(actual_order, wn, btype=btype, output='zpk')
                b, a = signal.butter(actual_order, wn, btype=btype, output='ba')
            elif designMethod == 'cheby1':
                sos_out = signal.cheby1(actual_order, apb, wn, btype=btype, output='sos')
                z, p, k = signal.cheby1(actual_order, apb, wn, btype=btype, output='zpk')
                b, a = signal.cheby1(actual_order, apb, wn, btype=btype, output='ba')
            elif designMethod == 'cheby2':
                sos_out = signal.cheby2(actual_order, asb, wn, btype=btype, output='sos')
                z, p, k = signal.cheby2(actual_order, asb, wn, btype=btype, output='zpk')
                b, a = signal.cheby2(actual_order, asb, wn, btype=btype, output='ba')
            elif designMethod == 'ellip':
                sos_out = signal.ellip(actual_order, apb, asb, wn, btype=btype, output='sos')
                z, p, k = signal.ellip(actual_order, apb, asb, wn, btype=btype, output='zpk')
                b, a = signal.ellip(actual_order, apb, asb, wn, btype=btype, output='ba')
            elif designMethod == 'bessel':
                sos_out = signal.bessel(actual_order, wn, btype=btype, norm='phase', output='sos')
                z, p, k = signal.bessel(actual_order, wn, btype=btype, norm='phase', output='zpk')
                b, a = signal.bessel(actual_order, wn, btype=btype, norm='phase', output='ba')

            zpk_out = (z, p, k)

        # ===================== FIR METHODS =====================
        elif designMethod == 'firwin':
            if order is None:
                actual_order = _estimate_fir_order(wp, ws, apb, asb)
            else:
                actual_order = int(order)

            numtaps = actual_order + 1
            if responseType in ('bandpass', 'bandstop'):
                cutoff = wp if isinstance(wp, list) else [wp]
            else:
                cutoff = wp

            pass_zero_map = {
                'lowpass': True, 'highpass': False,
                'bandpass': False, 'bandstop': True
            }
            pass_zero = pass_zero_map.get(responseType, True)

            b = signal.firwin(numtaps, cutoff, window=window, pass_zero=pass_zero)
            a = np.array([1.0])

        elif designMethod == 'firwin2':
            if order is None:
                actual_order = _estimate_fir_order(wp, ws, apb, asb)
            else:
                actual_order = int(order)

            numtaps = actual_order + 1
            if numtaps % 2 == 0:
                numtaps += 1  # firwin2 needs odd numtaps for type I

            # Build frequency/gain arrays based on response type
            if responseType == 'lowpass':
                freq = [0, wp, ws, 1.0]
                gain = [1, 1, 0, 0]
            elif responseType == 'highpass':
                freq = [0, ws, wp, 1.0]
                gain = [0, 0, 1, 1]
            elif responseType == 'bandpass':
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                freq = [0, s[0], w[0], w[1], s[1], 1.0]
                gain = [0, 0, 1, 1, 0, 0]
            else:  # bandstop
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                freq = [0, w[0], s[0], s[1], w[1], 1.0]
                gain = [1, 1, 0, 0, 1, 1]

            b = signal.firwin2(numtaps, freq, gain, window=window)
            a = np.array([1.0])

        elif designMethod == 'remez':
            if order is None:
                actual_order = _estimate_fir_order(wp, ws, apb, asb)
            else:
                actual_order = int(order)

            numtaps = actual_order + 1
            if numtaps < 3:
                numtaps = 3

            # Build frequency bands and desired response
            if responseType == 'lowpass':
                bands = [0, wp, ws, 1.0]
                desired = [1, 0]
            elif responseType == 'highpass':
                bands = [0, ws, wp, 1.0]
                desired = [0, 1]
            elif responseType == 'bandpass':
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                bands = [0, s[0], w[0], w[1], s[1], 1.0]
                desired = [0, 1, 0]
            else:  # bandstop
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                bands = [0, w[0], s[0], s[1], w[1], 1.0]
                desired = [1, 0, 1]

            b = signal.remez(numtaps, bands, desired, fs=2.0)
            a = np.array([1.0])

        elif designMethod == 'firls':
            if order is None:
                actual_order = _estimate_fir_order(wp, ws, apb, asb)
            else:
                actual_order = int(order)

            numtaps = actual_order + 1
            if numtaps % 2 == 0:
                numtaps += 1  # firls needs odd length for type I

            if responseType == 'lowpass':
                bands = [0, wp, ws, 1.0]
                desired = [1, 1, 0, 0]
            elif responseType == 'highpass':
                bands = [0, ws, wp, 1.0]
                desired = [0, 0, 1, 1]
            elif responseType == 'bandpass':
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                bands = [0, s[0], w[0], w[1], s[1], 1.0]
                desired = [0, 0, 1, 1, 0, 0]
            else:
                w = wp if isinstance(wp, list) else [wp, wp]
                s = ws if isinstance(ws, list) else [ws, ws]
                bands = [0, w[0], s[0], s[1], w[1], 1.0]
                desired = [1, 1, 0, 0, 1, 1]

            b = signal.firls(numtaps, bands, desired, fs=2.0)
            a = np.array([1.0])

        elif designMethod == 'mavg':
            if order is None:
                actual_order = max(3, int(1.0 / max(wp if not isinstance(wp, list) else wp[0], 0.01)))
            else:
                actual_order = int(order)

            numtaps = actual_order
            b = np.ones(numtaps) / numtaps
            a = np.array([1.0])

        else:
            raise ValueError(f"Unknown design method: {designMethod}")

        # --- Compute zeros, poles, gain for FIR ---
        if zpk_out is None and b is not None:
            z, p, k = signal.tf2zpk(b, a)
            zpk_out = (z, p, k)

        if actual_order is None:
            actual_order = len(b) - 1 if b is not None else 0

        # Format SOS
        sos_list = None
        if sos_out is not None:
            sos_list = sos_out.tolist()

        method_names = {
            'butter': 'Butterworth', 'cheby1': 'Chebyshev I', 'cheby2': 'Chebyshev II',
            'ellip': 'Elliptic', 'bessel': 'Bessel', 'firwin': 'FIR Window',
            'firwin2': 'FIR Arbitrary', 'remez': 'Equiripple', 'firls': 'Least-Squares',
            'mavg': 'Moving Average'
        }

        result = {
            'b': b.tolist() if b is not None else [],
            'a': a.tolist() if a is not None else [1.0],
            'zeros': zpk_out[0].tolist() if zpk_out else [],
            'poles': zpk_out[1].tolist() if zpk_out else [],
            'gain': float(np.real(zpk_out[2])) if zpk_out else 1.0,
            'sos': sos_list,
            'order': int(actual_order),
            'method': method_names.get(designMethod, designMethod),
        }

        return result

    except Exception as e:
        raise RuntimeError(f"Filter design failed: {str(e)}")


def _estimate_fir_order(wp, ws, apb, asb):
    """Estimate FIR filter order using Kaiser's formula."""
    if isinstance(wp, list):
        delta_f = abs(wp[0] - ws[0]) if isinstance(ws, list) else abs(wp[0] - ws)
    else:
        delta_f = abs(wp - ws) if not isinstance(ws, list) else abs(wp - ws[0])

    delta_f = max(delta_f, 0.01)

    # Kaiser's estimate
    A = float(asb)
    if A > 21:
        order = int(np.ceil((A - 7.95) / (14.36 * delta_f)))
    else:
        order = int(np.ceil(5.79 / delta_f))

    return max(order, 3)
