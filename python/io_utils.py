"""
PyFDA Web — File I/O Utilities
Export/Import filter data in npz, csv, mat formats
"""
import numpy as np
import json
import base64
import io


def export_filter(format='npz', b=None, a=None, zeros=None, poles=None,
                  gain=None, sos=None, order=None, method=None,
                  specs=None, **kwargs):
    """
    Export filter data to the specified format.
    Returns base64-encoded data for browser download.
    """
    b = np.array(b) if b is not None else np.array([1.0])
    a = np.array(a) if a is not None else np.array([1.0])

    if format == 'npz':
        buf = io.BytesIO()
        save_dict = {'b': b, 'a': a}
        if zeros is not None:
            save_dict['zeros'] = np.array(zeros)
        if poles is not None:
            save_dict['poles'] = np.array(poles)
        if gain is not None:
            save_dict['gain'] = np.array([gain])
        if sos is not None:
            save_dict['sos'] = np.array(sos)
        if order is not None:
            save_dict['order'] = np.array([order])

        np.savez_compressed(buf, **save_dict)
        buf.seek(0)
        data_b64 = base64.b64encode(buf.read()).decode('ascii')
        return {'data_b64': data_b64, 'filename': 'pyfda_filter.npz', 'mime': 'application/octet-stream'}

    elif format == 'csv':
        lines = []
        lines.append('# PyFDA Web Filter Export')
        if method:
            lines.append(f'# Method: {method}')
        if order is not None:
            lines.append(f'# Order: {order}')
        lines.append('')
        lines.append('# Numerator (b)')
        lines.append(','.join(f'{v:.15e}' for v in b))
        lines.append('')
        lines.append('# Denominator (a)')
        lines.append(','.join(f'{v:.15e}' for v in a))

        if zeros is not None:
            lines.append('')
            lines.append('# Zeros (real, imag)')
            z = np.array(zeros)
            if np.iscomplexobj(z):
                for zi in z:
                    lines.append(f'{zi.real:.15e},{zi.imag:.15e}')
            else:
                for zi in z:
                    lines.append(f'{zi:.15e},0')

        if poles is not None:
            lines.append('')
            lines.append('# Poles (real, imag)')
            p = np.array(poles)
            if np.iscomplexobj(p):
                for pi in p:
                    lines.append(f'{pi.real:.15e},{pi.imag:.15e}')
            else:
                for pi in p:
                    lines.append(f'{pi:.15e},0')

        csv_text = '\n'.join(lines)
        data_b64 = base64.b64encode(csv_text.encode('utf-8')).decode('ascii')
        return {'data_b64': data_b64, 'filename': 'pyfda_filter.csv', 'mime': 'text/csv'}

    elif format == 'mat':
        try:
            from scipy.io import savemat
            buf = io.BytesIO()
            mat_dict = {'b': b, 'a': a}
            if zeros is not None:
                mat_dict['zeros'] = np.array(zeros)
            if poles is not None:
                mat_dict['poles'] = np.array(poles)
            if gain is not None:
                mat_dict['gain'] = np.array([gain])
            if sos is not None:
                mat_dict['sos'] = np.array(sos)
            savemat(buf, mat_dict)
            buf.seek(0)
            data_b64 = base64.b64encode(buf.read()).decode('ascii')
            return {'data_b64': data_b64, 'filename': 'pyfda_filter.mat', 'mime': 'application/octet-stream'}
        except ImportError:
            raise RuntimeError("scipy.io.savemat not available for .mat export")

    elif format == 'json':
        data = {
            'b': b.tolist(), 'a': a.tolist(),
            'order': order, 'method': method,
        }
        if zeros is not None:
            data['zeros'] = np.array(zeros).tolist()
        if poles is not None:
            data['poles'] = np.array(poles).tolist()
        if gain is not None:
            data['gain'] = float(gain)
        if specs is not None:
            data['specs'] = specs

        json_text = json.dumps(data, indent=2)
        data_b64 = base64.b64encode(json_text.encode('utf-8')).decode('ascii')
        return {'data_b64': data_b64, 'filename': 'pyfda_filter.json', 'mime': 'application/json'}

    else:
        raise ValueError(f"Unsupported export format: {format}")


def import_filter(format='npz', data_b64='', **kwargs):
    """
    Import filter data from base64-encoded file content.
    """
    raw = base64.b64decode(data_b64)

    if format == 'npz':
        buf = io.BytesIO(raw)
        data = np.load(buf, allow_pickle=False)
        result = {}
        if 'b' in data:
            result['b'] = data['b'].tolist()
        if 'a' in data:
            result['a'] = data['a'].tolist()
        if 'zeros' in data:
            z = data['zeros']
            result['zeros'] = z.tolist()
        if 'poles' in data:
            p = data['poles']
            result['poles'] = p.tolist()
        if 'gain' in data:
            result['gain'] = float(data['gain'].flat[0])
        if 'sos' in data:
            result['sos'] = data['sos'].tolist()
        if 'order' in data:
            result['order'] = int(data['order'].flat[0])
        return result

    elif format == 'csv':
        text = raw.decode('utf-8')
        lines = [l.strip() for l in text.strip().split('\n')]

        result = {}
        section = None
        for line in lines:
            if not line or line.startswith('#'):
                if '# Numerator' in line:
                    section = 'b'
                elif '# Denominator' in line:
                    section = 'a'
                elif '# Zeros' in line:
                    section = 'zeros'
                elif '# Poles' in line:
                    section = 'poles'
                continue

            if section == 'b':
                result['b'] = [float(x) for x in line.split(',')]
                section = None
            elif section == 'a':
                result['a'] = [float(x) for x in line.split(',')]
                section = None
            elif section == 'zeros':
                if 'zeros' not in result:
                    result['zeros'] = []
                parts = line.split(',')
                result['zeros'].append(complex(float(parts[0]), float(parts[1]) if len(parts) > 1 else 0))
            elif section == 'poles':
                if 'poles' not in result:
                    result['poles'] = []
                parts = line.split(',')
                result['poles'].append(complex(float(parts[0]), float(parts[1]) if len(parts) > 1 else 0))

        return result

    elif format == 'json':
        return json.loads(raw.decode('utf-8'))

    elif format == 'mat':
        try:
            from scipy.io import loadmat
            buf = io.BytesIO(raw)
            data = loadmat(buf)
            result = {}
            if 'b' in data:
                result['b'] = np.squeeze(data['b']).tolist()
            if 'a' in data:
                result['a'] = np.squeeze(data['a']).tolist()
            if 'zeros' in data:
                result['zeros'] = np.squeeze(data['zeros']).tolist()
            if 'poles' in data:
                result['poles'] = np.squeeze(data['poles']).tolist()
            if 'gain' in data:
                result['gain'] = float(np.squeeze(data['gain']))
            if 'sos' in data:
                result['sos'] = data['sos'].tolist()
            return result
        except ImportError:
            raise RuntimeError("scipy.io.loadmat not available for .mat import")

    else:
        raise ValueError(f"Unsupported import format: {format}")
