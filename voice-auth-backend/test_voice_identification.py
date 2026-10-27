import argparse
import json

from app.services.identification_service import identification_service


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    args = parser.parse_args()

    result = identification_service.identify_from_file(args.audio)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
