"""Optional hackathon persona enrichment; sanitized summaries, never raw reports."""
import asyncio
import math
import httpx


def count(value):
    if isinstance(value, bool) or not isinstance(value, (str,int)):
        raise ValueError("Missing count")
    if isinstance(value,str) and not value.isdigit():
        raise ValueError("Invalid count")
    value=int(value)
    if value < 0: raise ValueError("Negative count")
    return value


def normalize(product, raw):
    try:
        if product == "criminal":
            order=raw["orderResponse"]
            if order["message"] != "Request Results" or order.get("status") not in (None,"Complete"):
                raise ValueError("Screening incomplete")
            data=raw["cicCriminal"]
            if data.get("errorCode") not in (None,"",0,"0"):
                raise ValueError("Screening error")
            n=count(data["candidates"]["count"])
            return {"available":True,"records":n,"flags":["criminal_records_require_review"] if n else []}
        if product == "fraudFinder":
            score=raw["risk"]["score"]
            if isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score) or not 0 <= score <= 100:
                raise ValueError("Unknown fraud score")
            return {"available":True,"score":score,"reviewThreshold":70,"flags":["fraud_risk_score_high"] if score >= 70 else []}
        if product == "publicRecords":
            data=raw["DetailedBLJReport"]
            counts={name:count(data[field]) for name,field in
                    (("bankruptcies","BankruptciesFound"),("liens","LiensFound"),("judgments","JudgmentsFound"))}
            return {"available":True,**counts,"flags":["public_records_require_review"] if sum(counts.values()) else []}
    except (KeyError, TypeError, ValueError):
        pass
    return {"available":False,"flags":[product+"_unavailable"]}


async def enrich(verifier, identity_id, identity):
    from crs import PERSONAS
    async def fetch(product,path):
        if not verifier.settings.configured or identity_id not in PERSONAS:
            return {"available":False,"flags":[product+"_unavailable"]}
        try:
            raw=await verifier._request(path,PERSONAS[identity_id][product])
            return normalize(product,raw)
        except (httpx.HTTPError,ValueError,TypeError):
            return {"available":False,"flags":[product+"_unavailable"]}
    products=("criminal","fraudFinder","publicRecords")
    reports=await asyncio.gather(fetch("criminal","/criminal/new-request"),
        fetch("fraudFinder","/fraud-finder/fraud-finder"),fetch("publicRecords","/pp/fcrablj/data"))
    flags=set(identity["fraudFlags"])
    for report in reports: flags.update(report["flags"])
    return {**identity,"available":identity["available"] and all(r["available"] for r in reports),
            "fraudFlags":sorted(flags),"report":{"identity":dict(identity),**dict(zip(products,reports))}}
