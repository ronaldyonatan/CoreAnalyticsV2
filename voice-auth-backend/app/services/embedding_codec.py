import base64

import numpy as np


def embedding_to_base64(
    embedding
):
    vector = np.asarray(
        embedding,
        dtype=np.float32
    ).reshape(-1)

    raw = vector.tobytes()

    return base64.b64encode(
        raw
    ).decode("ascii")


def embedding_from_base64(
    value
):
    raw = base64.b64decode(
        value
    )

    return np.frombuffer(
        raw,
        dtype=np.float32
    ).copy()