"""One live CRS check of its published test identity; prints only normalized flags.

Exit 2 means unavailable, not a clean identity result.
"""
import asyncio
import argparse
import json
from crs import CRSVerifier


async def main(identity="P01", include_report=False):
    verifier=CRSVerifier()
    try:
        result=await verifier.verify(identity,include_report)
        print(json.dumps({"sandbox":True,"testIdentityId":identity,**result},indent=2))
        if not result["available"]:
            print("Unavailable: check CRS credentials and account product roles. Payment hold remains.")
            return 2
        return 0
    finally:
        await verifier.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--persona",default="P01")
    parser.add_argument("--report",action="store_true")
    args=parser.parse_args()
    raise SystemExit(asyncio.run(main(args.persona,args.report)))
