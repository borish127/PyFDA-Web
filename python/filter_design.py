"""
PyFDA Web — Filter Design Dispatcher
All filter design methods using scipy.signal, aligned with chipmuenk/pyfda
"""
import numpy as np
from scipy import signal


# Amplitude clamp limits matching chipmuenk/pyfda special_functions.py
MIN_PB_AMP = 1e-5
MAX_IPB_AMP = 0.85
MAX_FPB_AMP = 0.5
MIN_SB_AMP = 1e-6
MAX_ISB_AMP = 0.65
MAX_FSB_AMP = 0.45


def unit2lin(unit_value, ft, amp_label, unit='db'):
    """Convert amplitude spec in 'db', 'linear' (V), or 'power' (W) to linear ripple/atten."""
    val = abs(float(unit_value))
    u = str(unit).lower()
    if u == 'db':
        if 'pb' in amp_label:
            if ft == 'iir':
                lin_val = 1.0 - 10.0 ** (-val / 20.0)
            else:
                p = 10.0 ** (val / 20.0)
                lin_val = (p - 1.0) / (p + 1.0)
        else:
            lin_val = 10.0 ** (-val / 20.0)
    elif u in ('power', 'w'):
        lin_val = float(np.sqrt(val))
    else:
        lin_val = val

    if 'pb' in amp_label:
        lin_val = max(MIN_PB_AMP, min(MAX_IPB_AMP if ft == 'iir' else MAX_FPB_AMP, lin_val))
    else:
        lin_val = max(MIN_SB_AMP, min(MAX_ISB_AMP if ft == 'iir' else MAX_FSB_AMP, lin_val))
    return float(lin_val)


def lin2db(lin_value, ft, amp_label):
    """Convert linear ripple/attenuation to positive dB spec for scipy/pyfda."""
    val = float(lin_value)
    if 'pb' in amp_label:
        if ft == 'iir':
            val = max(MIN_PB_AMP, min(MAX_IPB_AMP, val))
            return float(-20.0 * np.log10(1.0 - val))
        val = max(MIN_PB_AMP, min(MAX_FPB_AMP, val))
        return float(20.0 * np.log10((1.0 + val) / (1.0 - val)))
    val = max(MIN_SB_AMP, min(MAX_ISB_AMP if ft == 'iir' else MAX_FSB_AMP, val))
    return float(-20.0 * np.log10(val))


def _remlplen_ichige(fp, fs, dp, ds):
    """Ichige's accurate minimum FIR filter length estimate (from pyfda common.py)."""
    def func_v(df_v, dp_v):
        return 2.325 * ((-np.log10(dp_v)) ** -0.445) * (df_v ** -1.39)

    def func_g(df_v, fp_v):
        return (2.0 / np.pi) * np.arctan(func_v(df_v, dp) * (1.0 / max(fp_v, 1e-6) - 1.0 / max(0.5 - df_v, 1e-6)))

    def func_h(df_v, fp_v, c):
        return (2.0 / np.pi) * np.arctan((c / df_v) * (1.0 / max(fp_v, 1e-6) - 1.0 / max(0.5 - df_v, 1e-6)))

    df = max(abs(fs - fp), 1e-4)
    v_val = func_v(df, dp)
    g_val = func_g(df, fp)
    c1 = 2.0 * v_val / np.pi
    nc = int(np.ceil(
        (2.0 / df) * (np.log10(1.0 / (10.0 * dp * ds)) / np.log10(np.e)) * 0.35 + 1.0
    )) if (1.0 / max(dp * ds, 1e-12)) > 1 else 3
    # Full Ichige formula from scipy/pyfda remezord
    dn = np.log10(ds)
    dk = np.log10(dp)
    n1 = ((2.0 / df) * (-0.4278 - 0.5941 * dk - 0.00266 * dk * dk +
          (-0.4761 + 0.07114 * dk + 0.005309 * dk * dk) * dn) -
          (11.01217 + 0.51244 * (dk - dn)) * df + 1.0)
    # Use Herrmann/Ichige blend guarded for extreme specs
    n_ichige = int(np.ceil(max(3.0, n1 + 0.5 * (g_val + func_h(df, fp, c1)))))
    return max(3, min(n_ichige, 2000))


def _remezord(freqs, amps, rips, fs=1.0):
    """Port of pyfda's remezord() returning [numtaps, bands, amps, weight]."""
    freqs = np.asarray(freqs, dtype=float) / float(fs)
    amps = np.asarray(amps, dtype=float)
    rips = np.asarray(rips, dtype=float)
    rips = rips / (amps + (amps == 0.0))

    f1 = freqs[0:-1:2]
    f2 = freqs[1::2]
    fil_len = 3
    for i in range(len(amps) - 1):
        df = max(abs(f2[i] - f1[i]), 1e-4)
        # Kaiser + Herrmann length estimate (robust across all bands)
        n_kaiser = (-20.0 * np.log10(np.sqrt(rips[i] * rips[i + 1])) - 13.0) / (14.6 * df) + 1.0
        n_ich = _remlplen_ichige(f1[i], f2[i], rips[i], rips[i + 1])
        n_ich_sym = _remlplen_ichige(0.5 - f2[i], 0.5 - f1[i], rips[i + 1], rips[i])
        fil_len = max(fil_len, int(np.ceil(n_kaiser)), n_ich, n_ich_sym)

    bands = np.hstack((0.0, freqs, 0.5))
    weight = np.max(rips) / rips
    return int(fil_len), bands.tolist(), amps.tolist(), weight.tolist()


def _build_window_arg(window, win_param=None, win_param2=None):
    """Build SciPy window argument, adding parameter tuples where required."""
    w = str(window or 'hamming').lower()
    if w == 'rectangular':
        return 'boxcar'
    if w == 'kaiser':
        beta = float(win_param) if win_param is not None else 8.0
        return ('kaiser', max(0.0, beta))
    if w == 'tukey':
        alpha = float(win_param) if win_param is not None else 0.5
        return ('tukey', max(0.0, min(1.0, alpha)))
    if w == 'gaussian':
        std = float(win_param) if win_param is not None else 7.0
        return ('gaussian', max(0.1, std))
    if w == 'general_gaussian':
        p = float(win_param) if win_param is not None else 1.5
        sig = float(win_param2) if win_param2 is not None else 5.0
        return ('general_gaussian', max(0.1, p), max(0.1, sig))
    if w == 'dpss':
        nw = float(win_param) if win_param is not None else 3.0
        return ('dpss', max(0.5, nw))
    if w == 'chebwin':
        at = float(win_param) if win_param is not None else 80.0
        return ('chebwin', max(20.0, at))
    if w == 'exponential':
        tau = float(win_param) if win_param is not None else 3.0
        return ('exponential', None, max(0.1, tau))
    if w == 'taylor':
        nbar = int(win_param) if win_param is not None else 4
        return ('taylor', max(2, nbar))
    return w


def design_filter(responseType='lowpass', filterFamily='iir', designMethod='butter',
                  fs=48000, fpb=1000, fsb=5000, fpb2=8000, fsb2=12000,
                  apb=1, asb=60, order=None, window='hamming', winParam=None, winParam2=None,
                  freqUnit='hz', ampUnit='db',
                  wpb=1.0, wsb=1.0, wpb2=1.0, wsb2=1.0, gridDensity=16,
                  maStages=1, maNormalize=True, **kwargs):
    """
    Design a digital filter and return coefficients, poles, zeros, gain, and SOS.
    """
    try:
        fs = float(fs) if fs else 48000.0
        nyq = fs / 2.0

        # --- Normalize frequencies to Nyquist = 1.0 (for scipy) and f_S = 1.0 (for pyfda FIR) ---
        if freqUnit == 'normalized':
            # F_s normalized: 0 ... 0.5 -> multiply by 2.0 for Nyquist (0 ... 1.0)
            wp_s = float(fpb)
            ws_s = float(fsb)
            wp2_s = float(fpb2)
            ws2_s = float(fsb2)
        elif freqUnit == 'f_ny':
            # f_Ny normalized: 0 ... 1.0 -> divide by 2.0 for F_s (0 ... 0.5)
            wp_s = float(fpb) / 2.0
            ws_s = float(fsb) / 2.0
            wp2_s = float(fpb2) / 2.0
            ws2_s = float(fsb2) / 2.0
        else:
            # Absolute Hz (JS already multiplied kHz/MHz/GHz to Hz)
            wp_s = float(fpb) / fs
            ws_s = float(fsb) / fs
            wp2_s = float(fpb2) / fs
            ws2_s = float(fsb2) / fs

        # Clamp F_s-normalized values cleanly to (0.0005, 0.4995)
        def _clamp_fs(v):
            return max(0.0005, min(0.4995, float(v)))

        wp_s = _clamp_fs(wp_s)
        ws_s = _clamp_fs(ws_s)
        wp2_s = _clamp_fs(wp2_s)
        ws2_s = _clamp_fs(ws2_s)

        if responseType in ('bandpass', 'bandstop', 'hilbert'):
            wp_nyq = sorted([wp_s * 2.0, wp2_s * 2.0])
            ws_nyq = sorted([ws_s * 2.0, ws2_s * 2.0])
        else:
            wp_nyq = wp_s * 2.0
            ws_nyq = ws_s * 2.0

        # --- Convert amplitude specs to both linear and dB (depends on IIR vs FIR) ---
        ft = 'fir' if filterFamily == 'fir' else 'iir'
        apb_lin = unit2lin(apb, ft, 'a_pb', ampUnit)
        asb_lin = unit2lin(asb, ft, 'a_sb', ampUnit)
        apb_db = lin2db(apb_lin, ft, 'a_pb')
        asb_db = lin2db(asb_lin, ft, 'a_sb')

        b, a, sos_out, zpk_out = None, None, None, None
        actual_order = order
        computed_weights = None

        # ===================== ALLPASS (IIR / FIR Delay) =====================
        if responseType == 'allpass':
            n_ap = int(order) if order is not None else 4
            n_ap = max(1, min(n_ap, 128))
            if filterFamily == 'fir' or designMethod == 'mavg':
                # Pure integer delay z^{-N}
                b = np.zeros(n_ap + 1)
                b[-1] = 1.0
                a = np.array([1.0])
                actual_order = n_ap
            else:
                # Genuine IIR allpass phase equalizer: H(z) = z^{-N} A(z^-1) / A(z)
                # Derive stable prototype denominator A(z) from Butterworth/Cheby/Ellip at wp_nyq
                half_n = max(1, n_ap // 2) if n_ap >= 2 else 1
                if designMethod == 'cheby1':
                    _, a = signal.cheby1(n_ap, max(0.1, apb_db), wp_nyq, btype='lowpass', output='ba')
                elif designMethod == 'ellip':
                    _, a = signal.ellip(n_ap, max(0.1, apb_db), max(10.0, asb_db), wp_nyq, btype='lowpass', output='ba')
                elif designMethod == 'bessel':
                    _, a = signal.bessel(n_ap, wp_nyq, btype='lowpass', norm='phase', output='ba')
                else:
                    _, a = signal.butter(n_ap, wp_nyq, btype='lowpass', output='ba')
                b = a[::-1].copy()
                z, p, k = signal.tf2zpk(b, a)
                zpk_out = (z, p, k)
                sos_out = signal.zpk2sos(z, p, k)
                actual_order = len(a) - 1

        # ===================== IIR METHODS =====================
        elif designMethod in ('butter', 'cheby1', 'cheby2', 'ellip', 'bessel'):
            btype_map = {
                'lowpass': 'lowpass', 'highpass': 'highpass',
                'bandpass': 'bandpass', 'bandstop': 'bandstop',
            }
            btype = btype_map.get(responseType, 'lowpass')
            is_band = responseType in ('bandpass', 'bandstop')

            if order is None:
                if designMethod == 'butter':
                    n_proto, wn = signal.buttord(wp_nyq, ws_nyq, apb_db, asb_db)
                elif designMethod == 'cheby1':
                    n_proto, wn = signal.cheb1ord(wp_nyq, ws_nyq, apb_db, asb_db)
                elif designMethod == 'cheby2':
                    n_proto, wn = signal.cheb2ord(wp_nyq, ws_nyq, apb_db, asb_db)
                elif designMethod == 'ellip':
                    n_proto, wn = signal.ellipord(wp_nyq, ws_nyq, apb_db, asb_db)
                else:  # bessel uses buttord in chipmuenk/pyfda
                    n_proto, wn = signal.buttord(wp_nyq, ws_nyq, apb_db, asb_db)
                n_proto = max(1, min(int(n_proto), 40 if designMethod == 'bessel' else 64))
                actual_order = n_proto * 2 if is_band else n_proto
            else:
                req_order = max(1, int(order))
                n_proto = max(1, req_order // 2) if is_band else req_order
                wn = wp_nyq
                actual_order = n_proto * 2 if is_band else n_proto

            if designMethod == 'butter':
                sos_out = signal.butter(n_proto, wn, btype=btype, output='sos')
                z, p, k = signal.butter(n_proto, wn, btype=btype, output='zpk')
                b, a = signal.butter(n_proto, wn, btype=btype, output='ba')
            elif designMethod == 'cheby1':
                sos_out = signal.cheby1(n_proto, apb_db, wn, btype=btype, output='sos')
                z, p, k = signal.cheby1(n_proto, apb_db, wn, btype=btype, output='zpk')
                b, a = signal.cheby1(n_proto, apb_db, wn, btype=btype, output='ba')
            elif designMethod == 'cheby2':
                sos_out = signal.cheby2(n_proto, asb_db, wn, btype=btype, output='sos')
                z, p, k = signal.cheby2(n_proto, asb_db, wn, btype=btype, output='zpk')
                b, a = signal.cheby2(n_proto, asb_db, wn, btype=btype, output='ba')
            elif designMethod == 'ellip':
                sos_out = signal.ellip(n_proto, apb_db, asb_db, wn, btype=btype, output='sos')
                z, p, k = signal.ellip(n_proto, apb_db, asb_db, wn, btype=btype, output='zpk')
                b, a = signal.ellip(n_proto, apb_db, asb_db, wn, btype=btype, output='ba')
            elif designMethod == 'bessel':
                sos_out = signal.bessel(n_proto, wn, btype=btype, norm='phase', output='sos')
                z, p, k = signal.bessel(n_proto, wn, btype=btype, norm='phase', output='zpk')
                b, a = signal.bessel(n_proto, wn, btype=btype, norm='phase', output='ba')

            zpk_out = (z, p, k)

        # ===================== FIR METHODS =====================
        elif designMethod == 'firwin':
            win_arg = _build_window_arg(window, winParam, winParam2)
            if order is None:
                if str(window).lower() == 'kaiser':
                    df_nyq = abs(ws_s - wp_s) * 2.0
                    numtaps_k, beta = signal.kaiserord(asb_db, max(df_nyq, 1e-4))
                    actual_order = max(3, int(numtaps_k) - 1)
                    win_arg = ('kaiser', float(beta))
                else:
                    if responseType == 'lowpass':
                        numtaps_est, _, _, _ = _remezord([wp_s, ws_s], [1, 0], [apb_lin, asb_lin], fs=1.0)
                    elif responseType == 'highpass':
                        numtaps_est, _, _, _ = _remezord([ws_s, wp_s], [0, 1], [asb_lin, apb_lin], fs=1.0)
                    elif responseType == 'bandpass':
                        f_edges = sorted([ws_s, wp_s, wp2_s, ws2_s])
                        numtaps_est, _, _, _ = _remezord(f_edges, [0, 1, 0], [asb_lin, apb_lin, asb_lin], fs=1.0)
                    else:
                        f_edges = sorted([wp_s, ws_s, ws2_s, wp2_s])
                        numtaps_est, _, _, _ = _remezord(f_edges, [1, 0, 1], [apb_lin, asb_lin, apb_lin], fs=1.0)
                    actual_order = max(3, numtaps_est - 1)
                # Transition midpoint (-6 dB) matching chipmuenk/pyfda firwin.py
                if responseType in ('bandpass', 'bandstop'):
                    cutoff = sorted([(wp_s + ws_s), (wp2_s + ws2_s)])
                else:
                    cutoff = wp_s + ws_s  # ((wp_s + ws_s) / 2) * 2 = wp_s + ws_s in Nyquist units
            else:
                actual_order = max(1, int(order))
                cutoff = wp_nyq

            numtaps = actual_order + 1
            if responseType in ('highpass', 'bandstop') and numtaps % 2 == 0:
                numtaps += 1
                actual_order = numtaps - 1

            pass_zero_map = {
                'lowpass': True, 'highpass': False,
                'bandpass': False, 'bandstop': True
            }
            pass_zero = pass_zero_map.get(responseType, True)
            b = signal.firwin(numtaps, cutoff, window=win_arg, pass_zero=pass_zero)
            a = np.array([1.0])

        elif designMethod == 'firwin2':
            win_arg = _build_window_arg(window, winParam, winParam2)
            if order is None:
                numtaps_est, _, _, _ = _remezord([min(wp_s, ws_s), max(wp_s, ws_s)], [1, 0], [apb_lin, asb_lin], fs=1.0)
                actual_order = max(3, numtaps_est - 1)
            else:
                actual_order = max(2, int(order))

            numtaps = actual_order + 1
            if numtaps % 2 == 0:
                numtaps += 1
                actual_order = numtaps - 1

            if responseType == 'lowpass':
                f_lo, f_hi = sorted([wp_nyq, ws_nyq])
                freq, gain_arr = [0.0, f_lo, f_hi, 1.0], [1.0, 1.0, 0.0, 0.0]
            elif responseType == 'highpass':
                f_lo, f_hi = sorted([ws_nyq, wp_nyq])
                freq, gain_arr = [0.0, f_lo, f_hi, 1.0], [0.0, 0.0, 1.0, 1.0]
            elif responseType == 'bandpass':
                f1, f2, f3, f4 = sorted([ws_nyq[0], wp_nyq[0], wp_nyq[1], ws_nyq[1]])
                freq, gain_arr = [0.0, f1, f2, f3, f4, 1.0], [0.0, 0.0, 1.0, 1.0, 0.0, 0.0]
            else:
                f1, f2, f3, f4 = sorted([wp_nyq[0], ws_nyq[0], ws_nyq[1], wp_nyq[1]])
                freq, gain_arr = [0.0, f1, f2, f3, f4, 1.0], [1.0, 1.0, 0.0, 0.0, 1.0, 1.0]

            b = signal.firwin2(numtaps, freq, gain_arr, window=win_arg)
            a = np.array([1.0])

        elif designMethod == 'remez':
            gdens = max(4, int(gridDensity or 16))
            w_pb = max(1e-6, float(wpb or 1.0))
            w_sb = max(1e-6, float(wsb or 1.0))
            w_pb2 = max(1e-6, float(wpb2 or 1.0))
            w_sb2 = max(1e-6, float(wsb2 or 1.0))

            if responseType == 'hilbert':
                numtaps = max(3, int(order) + 1) if order is not None else 21
                f1, f2, f3, f4 = sorted([ws_s, wp_s, wp2_s, ws2_s])
                bands = [0.0, f1, f2, f3, f4, 0.5]
                b = signal.remez(numtaps, bands, [0, 1, 0], weight=[w_sb, w_pb, w_sb2],
                                 fs=1.0, type='hilbert', grid_density=gdens)
                actual_order = len(b) - 1
            elif responseType == 'differentiator':
                n_ord = max(2, int(order)) if order is not None else 20
                if n_ord % 2 == 1:
                    n_ord += 1
                numtaps = n_ord + 1
                f_hi = max(0.1, min(0.495, wp_s))
                b = signal.remez(numtaps, [0.0, f_hi], [np.pi * w_pb], fs=1.0,
                                 type='differentiator', grid_density=gdens)
                actual_order = len(b) - 1
            else:
                if order is None:
                    if responseType == 'lowpass':
                        f1, f2 = sorted([wp_s, ws_s])
                        numtaps, bands, desired, weights = _remezord([f1, f2], [1, 0], [apb_lin, asb_lin], fs=1.0)
                        computed_weights = {'wpb': weights[0], 'wsb': weights[1]}
                    elif responseType == 'highpass':
                        f1, f2 = sorted([ws_s, wp_s])
                        numtaps, bands, desired, weights = _remezord([f1, f2], [0, 1], [asb_lin, apb_lin], fs=1.0)
                        computed_weights = {'wsb': weights[0], 'wpb': weights[1]}
                    elif responseType == 'bandpass':
                        f1, f2, f3, f4 = sorted([ws_s, wp_s, wp2_s, ws2_s])
                        numtaps, bands, desired, weights = _remezord([f1, f2, f3, f4], [0, 1, 0], [asb_lin, apb_lin, asb_lin], fs=1.0)
                        computed_weights = {'wsb': weights[0], 'wpb': weights[1], 'wsb2': weights[2]}
                    else:  # bandstop
                        f1, f2, f3, f4 = sorted([wp_s, ws_s, ws2_s, wp2_s])
                        numtaps, bands, desired, weights = _remezord([f1, f2, f3, f4], [1, 0, 1], [apb_lin, asb_lin, apb_lin], fs=1.0)
                        computed_weights = {'wpb': weights[0], 'wsb': weights[1], 'wpb2': weights[2]}
                else:
                    numtaps = max(3, int(order) + 1)
                    if responseType == 'lowpass':
                        f1, f2 = sorted([wp_s, ws_s])
                        bands, desired, weights = [0.0, f1, f2, 0.5], [1, 0], [w_pb, w_sb]
                    elif responseType == 'highpass':
                        f1, f2 = sorted([ws_s, wp_s])
                        bands, desired, weights = [0.0, f1, f2, 0.5], [0, 1], [w_sb, w_pb]
                    elif responseType == 'bandpass':
                        f1, f2, f3, f4 = sorted([ws_s, wp_s, wp2_s, ws2_s])
                        bands, desired, weights = [0.0, f1, f2, f3, f4, 0.5], [0, 1, 0], [w_sb, w_pb, w_sb2]
                    else:
                        f1, f2, f3, f4 = sorted([wp_s, ws_s, ws2_s, wp2_s])
                        bands, desired, weights = [0.0, f1, f2, f3, f4, 0.5], [1, 0, 1], [w_pb, w_sb, w_pb2]

                if responseType == 'bandstop' and numtaps % 2 == 0:
                    numtaps += 1

                rtype = 'hilbert' if (responseType == 'highpass' and numtaps % 2 == 0) else 'bandpass'
                b = signal.remez(numtaps, bands, desired, weight=weights, fs=1.0,
                                 type=rtype, grid_density=gdens)
                actual_order = len(b) - 1
            a = np.array([1.0])

        elif designMethod == 'firls':
            w_pb = max(1e-6, float(wpb or 1.0))
            w_sb = max(1e-6, float(wsb or 1.0))
            w_pb2 = max(1e-6, float(wpb2 or 1.0))
            w_sb2 = max(1e-6, float(wsb2 or 1.0))

            if order is None:
                if responseType == 'lowpass':
                    f1, f2 = sorted([wp_s, ws_s])
                    numtaps, _, _, weights = _remezord([f1, f2], [1, 0], [apb_lin, asb_lin], fs=1.0)
                elif responseType == 'highpass':
                    f1, f2 = sorted([ws_s, wp_s])
                    numtaps, _, _, weights = _remezord([f1, f2], [0, 1], [asb_lin, apb_lin], fs=1.0)
                elif responseType == 'bandpass':
                    f1, f2, f3, f4 = sorted([ws_s, wp_s, wp2_s, ws2_s])
                    numtaps, _, _, weights = _remezord([f1, f2, f3, f4], [0, 1, 0], [asb_lin, apb_lin, asb_lin], fs=1.0)
                else:
                    f1, f2, f3, f4 = sorted([wp_s, ws_s, ws2_s, wp2_s])
                    numtaps, _, _, weights = _remezord([f1, f2, f3, f4], [1, 0, 1], [apb_lin, asb_lin, apb_lin], fs=1.0)
            else:
                numtaps = max(3, int(order) + 1)
                if responseType == 'lowpass':
                    weights = [w_pb, w_sb]
                elif responseType == 'highpass':
                    weights = [w_sb, w_pb]
                elif responseType == 'bandpass':
                    weights = [w_sb, w_pb, w_sb2]
                else:
                    weights = [w_pb, w_sb, w_pb2]

            if numtaps % 2 == 0:
                numtaps += 1

            if responseType == 'lowpass':
                f1, f2 = sorted([wp_s, ws_s])
                bands, desired = [0.0, f1, f2, 0.5], [1, 1, 0, 0]
            elif responseType == 'highpass':
                f1, f2 = sorted([ws_s, wp_s])
                bands, desired = [0.0, f1, f2, 0.5], [0, 0, 1, 1]
            elif responseType == 'bandpass':
                f1, f2, f3, f4 = sorted([ws_s, wp_s, wp2_s, ws2_s])
                bands, desired = [0.0, f1, f2, f3, f4, 0.5], [0, 0, 1, 1, 0, 0]
            else:
                f1, f2, f3, f4 = sorted([wp_s, ws_s, ws2_s, wp2_s])
                bands, desired = [0.0, f1, f2, f3, f4, 0.5], [1, 1, 0, 0, 1, 1]

            b = signal.firls(numtaps, bands, desired, weight=weights, fs=1.0)
            a = np.array([1.0])
            actual_order = len(b) - 1

        elif designMethod == 'mavg':
            stages = max(1, int(maStages or 1))
            if order is None:
                # Estimate delays per stage from stopband null / attenuation
                delays = max(2, int(round(0.5 / max(ws_s, 0.02))))
            else:
                delays = max(1, int(order))

            if responseType == 'highpass':
                b1 = np.ones(delays + 1)
                b1[1::2] = -1.0
            elif responseType == 'bandpass':
                if delays % 2 == 0:
                    delays += 1
                b1 = np.zeros(delays + 1)
                for k in range(0, delays + 1, 2):
                    b1[k] = 1.0 if (k // 2) % 2 == 0 else -1.0
            elif responseType == 'bandstop':
                if delays % 2 == 0:
                    delays += 1
                b1 = np.zeros(delays + 1)
                for k in range(0, delays + 1, 2):
                    b1[k] = 1.0
            else:
                b1 = np.ones(delays + 1)

            b = b1.copy()
            for _ in range(stages - 1):
                b = np.convolve(b, b1)
            if maNormalize:
                _, h_tmp = signal.freqz(b, [1.0], worN=1024)
                max_h = float(np.max(np.abs(h_tmp)))
                if max_h > 1e-12:
                    b = b / max_h
            a = np.array([1.0])
            actual_order = len(b) - 1

        else:
            raise ValueError(f"Unknown design method: {designMethod}")

        # --- Compute zeros, poles, gain for FIR ---
        if zpk_out is None and b is not None:
            z, p, k = signal.tf2zpk(b, a)
            zpk_out = (z, p, k)

        if actual_order is None:
            actual_order = len(b) - 1 if b is not None else 0

        sos_list = sos_out.tolist() if sos_out is not None else None

        method_names = {
            'butter': 'Butterworth', 'cheby1': 'Chebyshev I', 'cheby2': 'Chebyshev II',
            'ellip': 'Elliptic', 'bessel': 'Bessel', 'firwin': 'FIR Window',
            'firwin2': 'FIR Arbitrary', 'remez': 'Equiripple', 'firls': 'Least-Squares',
            'mavg': 'Moving Average'
        }

        return {
            'b': b.tolist() if b is not None else [],
            'a': a.tolist() if a is not None else [1.0],
            'zeros': [[float(z.real), float(z.imag)] for z in zpk_out[0]] if zpk_out else [],
            'poles': [[float(p.real), float(p.imag)] for p in zpk_out[1]] if zpk_out else [],
            'gain': float(np.real(zpk_out[2])) if zpk_out else 1.0,
            'sos': sos_list,
            'order': int(actual_order),
            'method': method_names.get(designMethod, designMethod),
            'weights': computed_weights,
        }

    except Exception as e:
        raise RuntimeError(f"Filter design failed: {str(e)}")
