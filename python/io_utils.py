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
        
        # 1. Enable allow_pickle=True (100% safe inside the Pyodide browser sandbox)
        data = np.load(buf, allow_pickle=True)
        result = {}

        def _to_list(val):
            # safely convert to Python list, handling 0D scalars gracefully
            v = np.asarray(val)
            if v.size == 0:
                return []
            if v.ndim == 0:
                return [v.tolist()]
            return v.tolist()
            
        def _to_scalar(val, dtype=float, default=1.0):
            # safely convert to scalar by grabbing the first element (works for any shape)
            try:
                v = np.asarray(val)
                return dtype(v.flat[0]) if v.size > 0 else default
            except Exception:
                return default
        
        # 2. Check for Desktop PyFDA's nested dictionary architecture ('fil_dict')
        if 'fil_dict' in data:
            try:
                fd = data['fil_dict'].item()
                if 'ba' in fd:
                    result['b'] = _to_list(fd['ba'][0])
                    result['a'] = _to_list(fd['ba'][1])
                if 'zpk' in fd:
                    result['zeros'] = _to_list(fd['zpk'][0])
                    result['poles'] = _to_list(fd['zpk'][1])
                    result['gain'] = _to_scalar(fd['zpk'][2], float, 1.0)
                if 'sos' in fd:
                    result['sos'] = _to_list(fd['sos'])
            except Exception as e:
                pass # Fallback to flat scanning if extraction fails

        # 3. Check for grouped array exports (Some desktop versions export 'ba' directly)
        if 'ba' in data and 'b' not in result:
            ba = data['ba']
            if len(ba) >= 2:
                result['b'] = _to_list(ba[0])
                result['a'] = _to_list(ba[1])
        if 'zpk' in data and 'zeros' not in result:
            zpk = data['zpk']
            if len(zpk) >= 3:
                result['zeros'] = _to_list(zpk[0])
                result['poles'] = _to_list(zpk[1])
                result['gain'] = _to_scalar(zpk[2], float, 1.0)

        # 4. Standard Flat Arrays (Native PyFDA Web format)
        if 'b' in data and 'b' not in result:
            result['b'] = _to_list(data['b'])
        if 'a' in data and 'a' not in result:
            result['a'] = _to_list(data['a'])
        if 'zeros' in data and 'zeros' not in result:
            result['zeros'] = _to_list(data['zeros'])
        if 'poles' in data and 'poles' not in result:
            result['poles'] = _to_list(data['poles'])
        if 'gain' in data and 'gain' not in result:
            result['gain'] = _to_scalar(data['gain'], float, 1.0)
        if 'sos' in data and 'sos' not in result:
            result['sos'] = _to_list(data['sos'])
        if 'order' in data and 'order' not in result:
            result['order'] = _to_scalar(data['order'], int, 0)
            
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
