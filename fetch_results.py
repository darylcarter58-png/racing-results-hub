def fetch_meetings() -> Dict[str, Any]:
    """
    Hit the results endpoint and adapt to the parameter names your account expects.
    We try several param name combos (on | date | meeting_date | from/to) and
    country key variants (countries | countrycodes | countryCodes).
    Stops at the first 200 OK with JSON that has useful keys.
    """
    base_params_day = [
        {"on": TODAY},
        {"date": TODAY},
        {"meeting_date": TODAY},
        {"day": TODAY},
    ]
    base_params_range = [
        {"from": TODAY, "to": TODAY},
        {"dateFrom": TODAY, "dateTo": TODAY},
        {"start_date": TODAY, "end_date": TODAY},
        {"startDate": TODAY, "endDate": TODAY},
    ]
    country_keys = ["countries", "countrycodes", "countryCodes", "country"]

    def with_country(p):
        out = []
        for ck in country_keys:
            q = dict(p)
            q[ck] = "GB,IE"
            out.append(q)
        return out

    # Try /v1/results first (Standard plan), then /results as a fallback
    paths = ["/v1/results", "/results"]

    last_err = None
    for path in paths:
        url = f"{BASE}{path}"

        # 1) single-day styles
        for p in base_params_day:
            for params in with_country(p):
                try:
                    print(f"➡️  Trying {url} with {params}")
                    data = get_json(url, params=params)
                    # Accept if it looks like results
                    if isinstance(data, dict) and (("meetings" in data) or ("races" in data)):
                        print(f"✔️  OK from {url} using {params}")
                        return data
                    if isinstance(data, list) and data:
                        print(f"✔️  OK (list) from {url} using {params}")
                        return {"races": data}
                    print(f"ℹ️  Unexpected keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                except Exception as e:
                    print(f"✖️  {e}")
                    last_err = e

        # 2) range styles (from/to etc.)
        for p in base_params_range:
            for params in with_country(p):
                try:
                    print(f"➡️  Trying {url} with {params}")
                    data = get_json(url, params=params)
                    if isinstance(data, dict) and (("meetings" in data) or ("races" in data)):
                        print(f"✔️  OK from {url} using {params}")
                        return data
                    if isinstance(data, list) and data:
                        print(f"✔️  OK (list) from {url} using {params}")
                        return {"races": data}
                    print(f"ℹ️  Unexpected keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                except Exception as e:
                    print(f"✖️  {e}")
                    last_err = e

    raise RuntimeError(f"No usable results endpoint/params. Last error: {last_err}")


